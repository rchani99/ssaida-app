import * as WebBrowser from 'expo-web-browser';

import { getSupabaseClient } from '@/lib/supabase/client';

WebBrowser.maybeCompleteAuthSession();

export async function signInWithGoogle(): Promise<void> {
  const redirectTo = process.env.EXPO_PUBLIC_AUTH_REDIRECT_URI;
  if (!redirectTo) {
    throw new Error('OAuth redirect URI가 설정되지 않았습니다. .env.example을 참고하세요.');
  }
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true },
  });

  if (error) throw error;
  if (!data.url) throw new Error('Google 로그인 주소를 생성하지 못했습니다.');

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') return;

  const callbackUrl = new URL(result.url);
  const oauthError = callbackUrl.searchParams.get('error_description');
  const code = callbackUrl.searchParams.get('code');
  if (oauthError) throw new Error(oauthError);
  if (!code) throw new Error('Google 로그인 응답에 인증 코드가 없습니다.');

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) throw exchangeError;
}
