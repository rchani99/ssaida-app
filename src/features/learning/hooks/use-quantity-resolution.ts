import { useMutation, useQueryClient } from '@tanstack/react-query';

import {
  previewQuantityResolution,
  resolveQuantityConflict,
} from '@/features/learning/api/quantity-resolution-api';
import { learningKeys } from '@/features/learning/hooks/use-learning';

export function usePreviewQuantityResolution() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: previewQuantityResolution,
    retry: false,
    networkMode: 'always',
    onError: () => {
      void client.invalidateQueries({ queryKey: learningKeys.all }).catch(() => {});
    },
  });
}

export function useResolveQuantityConflict() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: resolveQuantityConflict,
    retry: false,
    networkMode: 'always',
    // Slow/offline refresh must not trap the confirmation UI in a saving state.
    onSettled: () => {
      void client.invalidateQueries({ queryKey: learningKeys.all }).catch(() => {});
    },
  });
}
