import { useCallback, useEffect, useMemo, useState, type PropsWithChildren } from 'react';

import { AuthContext } from '@/features/auth/hooks/use-auth';
import { getSupabaseClient } from '@/lib/supabase/client';

import type { ParentProfile } from '@/features/auth/types/auth.types';
import type { Session } from '@supabase/supabase-js';

type ClientState =
  | { client: ReturnType<typeof getSupabaseClient>; errorMessage: null }
  | { client: null; errorMessage: string };

export function AuthProvider({ children }: PropsWithChildren) {
  const [clientState] = useState<ClientState>(() => {
    try {
      return { client: getSupabaseClient(), errorMessage: null };
    } catch (error) {
      return {
        client: null,
        errorMessage: error instanceof Error ? error.message : 'Supabase 설정을 확인해 주세요.',
      };
    }
  });
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<ParentProfile | null>(null);
  const [sessionLoading, setSessionLoading] = useState(clientState.client !== null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  const loadProfile = useCallback(
    async (currentSession: Session | null) => {
      if (!clientState.client || !currentSession?.user.id) {
        setProfile(null);
        setProfileLoading(false);
        return;
      }
      setProfileLoading(true);
      setProfileError(null);
      const { data, error } = await clientState.client
        .from('profiles')
        .select('*')
        .eq('auth_user_id', currentSession.user.id)
        .maybeSingle();

      if (error) {
        setProfileError('부모 프로필을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.');
        setProfile(null);
      } else {
        setProfile(data);
      }
      setProfileLoading(false);
    },
    [clientState.client],
  );

  const refreshProfile = useCallback(async () => loadProfile(session), [loadProfile, session]);

  useEffect(() => {
    if (!clientState.client) return;
    let mounted = true;
    const { data: listener } = clientState.client.auth.onAuthStateChange((_event, nextSession) => {
      if (mounted) {
        setSession(nextSession);
        setSessionLoading(false);
        setProfileLoading(nextSession !== null);
        setTimeout(() => void loadProfile(nextSession), 0);
      }
    });
    void clientState.client.auth.getSession().then(({ data, error }) => {
      if (mounted) {
        setSession(error ? null : data.session);
        setSessionLoading(false);
        setProfileLoading(!error && data.session !== null);
        void loadProfile(error ? null : data.session);
      }
    });
    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [clientState.client, loadProfile]);

  const signOut = useCallback(async () => {
    if (!clientState.client) return;
    const { error } = await clientState.client.auth.signOut();
    if (error) throw error;
  }, [clientState.client]);

  const value = useMemo(
    () => ({
      session,
      profile,
      isLoading: sessionLoading || profileLoading,
      isAuthenticated: session !== null,
      errorMessage: clientState.errorMessage ?? profileError,
      refreshProfile,
      signOut,
    }),
    [
      clientState.errorMessage,
      profile,
      profileError,
      profileLoading,
      refreshProfile,
      session,
      sessionLoading,
      signOut,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
