import { EmailDeliveryError } from './email-mailer.ts';

import type { DeletionEmailSender, DeletionMail } from './email-mailer.ts';

// Keep this template/body stable for the lifetime of queued challenges. Resend
// rejects a changed payload for the same key; never rotate the key to bypass that.
export function deletionEmailTemplate(code: string) {
  if (!/^\d{8}$/.test(code)) throw new EmailDeliveryError('FAILED');
  const paragraphs = [
    '쌓이다 계정 삭제를 위한 이메일 확인 코드입니다.',
    `인증 코드: ${code}`,
    '코드는 요청 시점부터 10분 동안 한 번만 사용할 수 있습니다.',
    '이메일 확인 후 앱 또는 웹에서 삭제에 최종 동의하면 14일 유예 기간이 시작됩니다.',
    '유예 기간에는 서비스를 이용하거나 삭제 요청을 취소할 수 있습니다.',
    '코드를 다른 사람에게 알려주지 마세요. 요청하지 않았다면 이 메일을 무시하세요.',
  ];
  return {
    subject: '[쌓이다] 계정 삭제 이메일 확인',
    text: paragraphs.join('\n\n'),
    html: `<!doctype html><html lang="ko"><head><meta charset="utf-8"></head><body><h1>계정 삭제 이메일 확인</h1>${paragraphs.map((p) => `<p>${p}</p>`).join('')}</body></html>`,
  };
}

function validAddress(value: string) {
  return value.length <= 254 && /^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(value);
}

export function validResendSettings(key: string, from: string) {
  if (!/^re_[A-Za-z0-9_-]+$/.test(key) || key.length > 512 || /[\r\n]/.test(from)) return false;
  const named = /^([^<>]+) <([^<>]+)>$/.exec(from);
  return from.length <= 320 && validAddress(named ? named[2] : from);
}

function retryDelay(value: string | null, now: number) {
  if (!value) return 15;
  const numeric = /^\d+(\.\d+)?$/.test(value);
  const seconds = numeric ? Number(value) : (Date.parse(value) - now) / 1000;
  // A delay beyond the code lifetime is terminal. Do not clamp it down and send
  // earlier than the provider allows. 601 is a sentinel understood by the DB.
  if (numeric && !Number.isFinite(seconds)) return 601;
  return Number.isFinite(seconds) ? Math.min(601, Math.max(15, Math.ceil(seconds))) : 15;
}

async function smallJson(response: Response): Promise<Record<string, unknown>> {
  if (!response.body) return {};
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 4096) {
        void reader.cancel().catch(() => {});
        return {};
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    const result = JSON.parse(new TextDecoder().decode(bytes));
    return result && typeof result === 'object' && !Array.isArray(result) ? result : {};
  } catch {
    return {};
  } finally {
    reader.releaseLock();
  }
}

export class ResendDeletionEmailSender implements DeletionEmailSender {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly http: typeof fetch = fetch,
    private readonly timeoutMs = 8000,
    private readonly now: () => number = Date.now,
  ) {
    if (!validResendSettings(apiKey, from)) throw new EmailDeliveryError('FAILED');
  }

  async send(message: DeletionMail) {
    if (
      !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(message.requestId) ||
      !validAddress(message.email)
    )
      throw new EmailDeliveryError('FAILED');
    const body = JSON.stringify({
      from: this.from,
      to: [message.email],
      ...deletionEmailTemplate(message.code),
    });
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let retryAfterSeconds = 15;
    try {
      await Promise.race([
        (async () => {
          const response = await this.http('https://api.resend.com/emails', {
            method: 'POST',
            redirect: 'error',
            signal: controller.signal,
            headers: {
              Authorization: `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json',
              'Idempotency-Key': `account-deletion/${message.requestId}`,
            },
            body,
          });
          // Preserve provider backoff even if its response body stalls or fails.
          retryAfterSeconds = retryDelay(response.headers.get('retry-after'), this.now());
          const data = await smallJson(response);
          if (response.ok) {
            if (typeof data.id === 'string' && data.id.length > 0 && data.id.length <= 128) return;
            throw new EmailDeliveryError('UNKNOWN');
          }
          if (
            response.status === 429 &&
            (data.name === 'daily_quota_exceeded' || data.name === 'monthly_quota_exceeded')
          )
            throw new EmailDeliveryError('FAILED');
          if (
            response.status === 429 ||
            response.status >= 500 ||
            (response.status === 409 && data.name === 'concurrent_idempotent_requests')
          )
            throw new EmailDeliveryError('RETRY', retryAfterSeconds);
          throw new EmailDeliveryError('FAILED');
        })(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new EmailDeliveryError('RETRY', retryAfterSeconds));
          }, this.timeoutMs);
        }),
      ]);
    } catch (error) {
      // Never propagate fetch exceptions or provider response bodies: they may
      // contain recipients, credentials or message content. Network/timeout
      // retries are safe only because every attempt uses the same Resend key.
      if (error instanceof EmailDeliveryError) throw error;
      throw new EmailDeliveryError('RETRY', retryAfterSeconds);
    } finally {
      clearTimeout(timer);
    }
  }
}
