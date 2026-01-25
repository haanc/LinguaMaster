/**
 * User Context - Authentication and subscription state management
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
import { supabase, getSessionWithTimeout } from '../services/supabase';
import { edgeApi } from '../services/edgeApi';

// Types
export type UserTier = 'guest' | 'free' | 'pro';

export interface UserProfile {
  id: string;
  email: string | null;
  tier: UserTier;
  creditsBalance: number;
  creditsMonthlyLimit: number;
  creditsResetAt: string | null;
  referralCode: string | null;
}

interface UserContextType {
  user: UserProfile | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  tier: UserTier;
  credits: number;
  creditsLimit: number;
  refreshUser: () => Promise<void>;
  signOut: () => Promise<void>;
}

const defaultContext: UserContextType = {
  user: null,
  isLoading: true,
  isAuthenticated: false,
  tier: 'guest',
  credits: 0,
  creditsLimit: 0,
  refreshUser: async () => {},
  signOut: async () => {},
};

const UserContext = createContext<UserContextType>(defaultContext);

// Guest user constant
const GUEST_USER: UserProfile = {
  id: 'guest',
  email: null,
  tier: 'guest',
  creditsBalance: 0,
  creditsMonthlyLimit: 0,
  creditsResetAt: null,
  referralCode: null,
};

interface UserProviderProps {
  children: ReactNode;
}

export function UserProvider({ children }: UserProviderProps) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchUserProfile = useCallback(async () => {
    try {
      // Use getSessionWithTimeout instead of getSession - handles SDK hang issue
      const { session, error: sessionError } = await getSessionWithTimeout(3000);

      console.log('UserContext fetchUserProfile:', {
        hasSession: !!session,
        userId: session?.user?.id,
        error: sessionError?.message
      });

      if (!session?.user) {
        setUser(GUEST_USER);
        return;
      }

      // Fetch full profile from Edge Function
      try {
        const profile = await edgeApi.getProfile();

        setUser({
          id: profile.id,
          email: profile.email,
          tier: profile.tier as UserTier,
          creditsBalance: profile.credits_balance,
          creditsMonthlyLimit: profile.credits_monthly_limit,
          creditsResetAt: profile.credits_reset_at,
          referralCode: profile.referral_code,
        });
      } catch (profileError) {
        console.error('Failed to fetch profile from Edge Function:', profileError);
        // Still set user as authenticated even if profile fetch fails
        // This prevents logout on Edge Function errors
        setUser({
          id: session.user.id,
          email: session.user.email || null,
          tier: 'free', // Default tier
          creditsBalance: 0,
          creditsMonthlyLimit: 500,
          creditsResetAt: null,
          referralCode: null,
        });
      }
    } catch (error) {
      console.error('Failed to fetch user profile:', error);
      setUser(GUEST_USER);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const refreshUser = useCallback(async () => {
    await fetchUserProfile();
  }, [fetchUserProfile]);

  const signOut = useCallback(async () => {
    try {
      await supabase.auth.signOut();
      setUser(GUEST_USER);
      localStorage.removeItem('userId');
      localStorage.removeItem('userRole');
    } catch (error) {
      console.error('Sign out error:', error);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchUserProfile();
  }, [fetchUserProfile]);

  // Listen for auth state changes
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_IN' && session) {
          localStorage.setItem('userId', session.user.id);
          localStorage.setItem('userRole', 'user');
          await fetchUserProfile();
        } else if (event === 'SIGNED_OUT') {
          setUser(GUEST_USER);
          localStorage.removeItem('userId');
          localStorage.removeItem('userRole');
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, [fetchUserProfile]);

  const value: UserContextType = {
    user,
    isLoading,
    isAuthenticated: user !== null && user.tier !== 'guest',
    tier: user?.tier || 'guest',
    credits: user?.creditsBalance || 0,
    creditsLimit: user?.creditsMonthlyLimit || 0,
    refreshUser,
    signOut,
  };

  return (
    <UserContext.Provider value={value}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
}

// Helper hooks
export function useIsAuthenticated(): boolean {
  const { isAuthenticated } = useUser();
  return isAuthenticated;
}

export function useIsPro(): boolean {
  const { tier } = useUser();
  return tier === 'pro';
}

export function useCredits(): { balance: number; limit: number } {
  const { credits, creditsLimit } = useUser();
  return { balance: credits, limit: creditsLimit };
}
