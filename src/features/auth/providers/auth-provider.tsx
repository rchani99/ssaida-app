import { useCallback, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';

import { AuthContext } from '@/features/auth/hooks/use-auth';
import { queryClient } from '@/lib/query-client';
import { getSupabaseClient } from '@/lib/supabase/client';
import { useAppModeStore } from '@/store/app-mode.store';

import type { ParentProfile } from '@/features/auth/types/auth.types';
import type { Session } from '@supabase/supabase-js';

type ClientState =
  | { client: ReturnType<typeof getSupabaseClient>; errorMessage: null }
  | { client: null; errorMessage: string };

export function AuthProvider({ children }: PropsWithChildren) {
  const activeUserId = useRef<string | null>(null);
  const sessionRevision = useRef(0);
  const profileRequest = useRef(0);
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
    async (currentSession: Session | null, revision = sessionRevision.current) => {
      if (
        revision !== sessionRevision.current ||
        (currentSession?.user.id ?? null) !== activeUserId.current
      )
        return;
      const request = ++profileRequest.current;
      if (!clientState.client || !currentSession?.user.id) {
        setProfile(null);
        setProfileLoading(false);
        return;
      }
      setProfileLoading(true);
      setProfileError(null);
      const isCurrent = () =>
        revision === sessionRevision.current && request === profileRequest.current;
      try {
        const { data, error } = await clientState.client
          .from('profiles')
          .select('*')
          .eq('auth_user_id', currentSession.user.id)
          .maybeSingle();
        if (!isCurrent()) return;
        if (error) throw error;
        setProfile(data);
      } catch {
        if (!isCurrent()) return;
        setProfileError('부모 프로필을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.');
        setProfile(null);
      } finally {
        if (isCurrent()) setProfileLoading(false);
      }
    },
    [clientState.client],
  );

  const refreshProfile = useCallback(async () => loadProfile(session), [loadProfile, session]);

  useEffect(() => {
    if (!clientState.client) return;
    let mounted = true;
    let receivedAuthEvent = false;
    const lifecycleRevision = sessionRevision;
    const lifecycleRequest = profileRequest;
    const resetForUser = (nextSession: Session | null) => {
      const nextUserId = nextSession?.user.id ?? null;
      if (activeUserId.current !== nextUserId || nextUserId === null) {
        useAppModeStore.getState().setMode('child');
        queryClient.clear();
        activeUserId.current = nextUserId;
        setProfile(null);
      }
    };
    // INITIAL_SESSION already restores persisted auth. A separate getSession()
    // snapshot can arrive after SIGNED_OUT and incorrectly authenticate again.
    const { data: listener } = clientState.client.auth.onAuthStateChange((event, nextSession) => {
      if (mounted) {
        if (event === 'INITIAL_SESSION' && receivedAuthEvent) return;
        receivedAuthEvent = true;
        const revision = ++sessionRevision.current;
        profileRequest.current++;
        resetForUser(nextSession);
        setSession(nextSession);
        setSessionLoading(false);
        setProfileError(null);
        setProfileLoading(nextSession !== null);
        if (nextSession) {
          // Keep Supabase queries outside its synchronous auth callback/lock.
          setTimeout(() => {
            if (mounted) void loadProfile(nextSession, revision);
          }, 0);
        }
      }
    });
    return () => {
      mounted = false;
      lifecycleRevision.current++;
      lifecycleRequest.current++;
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
