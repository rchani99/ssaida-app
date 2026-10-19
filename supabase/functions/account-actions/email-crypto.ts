import { generateReceipt, hashReceipt } from './receipt.ts';

const encoder = new TextEncoder();
const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
const unhex = (value: string) =>
  new Uint8Array(value.match(/../g)!.map((pair) => parseInt(pair, 16)));
export function generateEmailCode() {
  const bytes = new Uint32Array(1);
  do {
    crypto.getRandomValues(bytes);
  } while (bytes[0] >= 4200000000);
  return String(bytes[0] % 100000000).padStart(8, '0');
}
export function createEmailCrypto(hmacSecret: string, encryptionSecret: string) {
  if (
    ![hmacSecret, encryptionSecret].every((value) => /^[0-9a-f]{64}$/.test(value)) ||
    hmacSecret === encryptionSecret
  )
    throw new Error('Email crypto not configured');
  const hmac = crypto.subtle.importKey(
    'raw',
    unhex(hmacSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const aes = crypto.subtle.importKey('raw', unhex(encryptionSecret), 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ]);
  return {
    token: generateReceipt,
    hash: hashReceipt,
    code: generateEmailCode,
    async tag(purpose: string, value: string) {
      return hex(
        new Uint8Array(
          await crypto.subtle.sign(
            'HMAC',
            await hmac,
            encoder.encode(JSON.stringify(['deletion-email-v1', purpose, value])),
          ),
        ),
      );
    },
    async seal(requestId: string, value: { email: string; code: string }) {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const cipher = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv, additionalData: encoder.encode(requestId) },
        await aes,
        encoder.encode(JSON.stringify(value)),
      );
      return `${hex(iv)}.${hex(new Uint8Array(cipher))}`;
    },
    async open(requestId: string, ciphertext: string): Promise<{ email: string; code: string }> {
      const [iv, body] = ciphertext.split('.');
      if (!/^[0-9a-f]{24}$/.test(iv) || !body || !/^[0-9a-f]+$/.test(body) || body.length % 2)
        throw new Error('Invalid envelope');
      return JSON.parse(
        new TextDecoder().decode(
          await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: unhex(iv), additionalData: encoder.encode(requestId) },
            await aes,
            unhex(body),
          ),
        ),
      );
    },
  };
}
export type EmailCrypto = ReturnType<typeof createEmailCrypto>;
