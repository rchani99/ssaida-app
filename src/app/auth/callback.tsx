import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';

import { useAuth } from '@/features/auth/hooks/use-auth';
import { exchangeGoogleCallback } from '@/features/auth/services/google-oauth';
import { ScreenMessage } from '@/shared/components/screen-message';

export default function GoogleCallbackScreen() {
  const {
    code,
    error,
    error_description: errorDescription,
  } = useLocalSearchParams<{
    code?: string;
    error?: string;
    error_description?: string;
  }>();
  const router = useRouter();
  const auth = useAuth();
  const [finished, setFinished] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    if (!code || error || errorDescription) return;
    void exchangeGoogleCallback(code).then(
      () => {
        if (active) setFinished(true);
      },
      () => {
        if (active) setFailed(true);
      },
    );
    return () => {
      active = false;
    };
  }, [code, error, errorDescription]);
  useEffect(() => {
    if (finished && !auth.isLoading && auth.isAuthenticated && !auth.errorMessage) {
      router.replace(auth.profile?.onboarding_completed ? '/' : '/onboarding');
    }
  }, [finished, auth.isLoading, auth.isAuthenticated, auth.profile, auth.errorMessage, router]);
  if (!code || error || errorDescription || failed || (finished && auth.errorMessage))
    return (
      <ScreenMessage
        message="로그인을 완료하지 못했어요. 다시 시도해 주세요."
        actionLabel="돌아가기"
        onAction={() => router.replace(auth.isAuthenticated ? '/' : '/login')}
      />
    );
  return <ScreenMessage loading message="로그인을 마무리하고 있어요." />;
}
