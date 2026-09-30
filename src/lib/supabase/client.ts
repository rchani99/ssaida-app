import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, processLock, type SupabaseClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';
import 'react-native-url-polyfill/auto';

import { getAppEnvironment } from '@/config/environment';

import type { Database } from '@/lib/supabase/database.types';

let client: SupabaseClient<Database> | undefined;
let appStateListenerRegistered = false;

export function getSupabaseClient(): SupabaseClient<Database> {
  if (client) return client;

  const { url, publishableKey } = getAppEnvironment();

  client = createClient<Database>(url, publishableKey, {
    auth: {
      ...(Platform.OS !== 'web' ? { storage: AsyncStorage } : {}),
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      flowType: 'pkce',
      lock: processLock,
    },
  });

  if (Platform.OS !== 'web' && !appStateListenerRegistered) {
    appStateListenerRegistered = true;
    AppState.addEventListener('change', (state) => {
      if (state === 'active') client?.auth.startAutoRefresh();
      else client?.auth.stopAutoRefresh();
    });
  }

  return client;
}
