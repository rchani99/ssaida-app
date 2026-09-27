import { getSupabaseClient } from '@/lib/supabase/client';

import type { QuantityResolution } from '@/features/learning/types/learning.types';
import type { Json } from '@/lib/supabase/database.types';

export class QuantityResolutionError extends Error {
  constructor(
    public readonly kind: 'conflict' | 'pending' | 'generation' | 'other-plan' | 'request',
  ) {
    super(
      {
        conflict: '공부 상태가 변경됐어요. 최신 목록에서 다시 확인해 주세요.',
        pending: '지난 공부를 먼저 확인한 후 진도에 맞춰 주세요.',
        generation: '다음 시작 페이지 설정이 변경됐어요. 기존 계획과 설정을 먼저 확인해 주세요.',
        'other-plan':
          '같은 문제집의 다른 계획과 겹치거나 진행 중인 공부가 있어요. 먼저 확인해 주세요.',
        request: '처리 결과를 확인하지 못했어요. 연결과 최신 목록을 확인해 주세요.',
      }[kind],
    );
    this.name = 'QuantityResolutionError';
  }
}

function isProposal(value: Json): value is QuantityResolution {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return (
    typeof value.task_id === 'string' &&
    typeof value.context_token === 'string' &&
    ['GAP', 'ALIGNED', 'PARTIAL_OVERLAP', 'FULL_OVERLAP'].includes(String(value.kind)) &&
    ['ADJUST', 'EXCLUDE'].includes(String(value.action)) &&
    ['confirmed_progress', 'old_start', 'old_end', 'new_start', 'new_end'].every(
      (key) => typeof value[key] === 'number' && Number.isInteger(value[key]),
    )
  );
}

async function requestResolution(taskId: string, token?: string): Promise<QuantityResolution> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new QuantityResolutionError('request'));
        controller.abort();
      }, 15_000);
    });
    const client = getSupabaseClient();
    const request =
      token === undefined
        ? client.rpc('preview_quantity_conflict_resolution', { target_daily_task_id: taskId })
        : client.rpc('resolve_quantity_conflict', {
            target_daily_task_id: taskId,
            expected_context_token: token,
          });
    const { data, error } = await Promise.race([request.abortSignal(controller.signal), timeout]);
    if (error) {
      if (__DEV__) console.error('[learning] quantity resolution', error);
      throw new QuantityResolutionError(
        error.code === 'PT409' || error.code === '40001'
          ? 'conflict'
          : error.code === 'PT412'
            ? 'pending'
            : error.code === 'PT422'
              ? 'generation'
              : error.code === 'PT423'
                ? 'other-plan'
                : 'request',
      );
    }
    if (!isProposal(data)) throw new QuantityResolutionError('request');
    return data;
  } catch (error) {
    if (error instanceof QuantityResolutionError) throw error;
    throw new QuantityResolutionError('request');
  } finally {
    clearTimeout(timer);
  }
}

export const previewQuantityResolution = (taskId: string) => requestResolution(taskId);
export const resolveQuantityConflict = (proposal: QuantityResolution) =>
  requestResolution(proposal.task_id, proposal.context_token);
