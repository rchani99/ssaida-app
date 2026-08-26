import { QueryClientProvider } from '@tanstack/react-query';

import { AuthProvider } from '@/features/auth/providers/auth-provider';
import { queryClient } from '@/lib/query-client';

import type { PropsWithChildren } from 'react';

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
}
