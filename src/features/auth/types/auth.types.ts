import type { Database } from '@/lib/supabase/database.types';
import type { Session } from '@supabase/supabase-js';

export type ParentProfile = Database['public']['Tables']['profiles']['Row'];

export type AuthContextValue = {
  session: Session | null;
  profile: ParentProfile | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  errorMessage: string | null;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};
