
import { createClient, Session } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    console.warn("Supabase credentials not found in environment variables.");
}

// Fallback to prevent crash if env vars are missing (e.g. before restart)
const validUrl = supabaseUrl && supabaseUrl.startsWith('http') ? supabaseUrl : 'https://placeholder.supabase.co';
const validKey = supabaseAnonKey || 'placeholder';

// Extract project ref for storage key
const projectRef = validUrl.includes('supabase.co')
    ? validUrl.split('//')[1]?.split('.')[0]
    : 'local';
const storageKey = `sb-${projectRef}-auth-token`;

console.log("🔌 Supabase Init:", {
    url: validUrl,
    keyLength: validKey?.length,
    storageKey,
    isPlaceholder: validUrl.includes('placeholder')
});

// Use default storage key - Supabase SDK generates: sb-{project-ref}-auth-token
// Custom storageKey was causing issues with session persistence
export const supabase = createClient(validUrl, validKey, {
    auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
    }
});

// Expose to window for debugging
if (typeof window !== 'undefined') {
    (window as any).supabase = supabase;
}

// Token refresh lock to prevent concurrent refresh attempts
let refreshPromise: Promise<Session | null> | null = null;
let cachedSession: Session | null = null;
let cachedSessionExpiry: number = 0;

/**
 * Get session with timeout and manual refresh fallback.
 * Supabase SDK 2.x can sometimes hang on getSession() when token needs refresh.
 * This version completely bypasses the SDK when it hangs and uses a refresh lock
 * to prevent concurrent refresh attempts (refresh tokens are one-time use).
 */
export const getSessionWithTimeout = async (timeoutMs = 3000): Promise<{ session: Session | null; error: Error | null }> => {
    const now = Date.now();
    const nowSec = Math.floor(now / 1000);

    // Check cached session first (valid for 30 seconds AND not expired)
    if (cachedSession && cachedSessionExpiry > now) {
        // Also check if the actual token is not expired
        if (cachedSession.expires_at && cachedSession.expires_at > nowSec + 60) {
            return { session: cachedSession, error: null };
        }
        // Token is about to expire, clear cache and refresh
        console.log('Cached session token expiring soon, refreshing...');
        cachedSession = null;
        cachedSessionExpiry = 0;
    }

    try {
        // Race between getSession and timeout
        const result = await Promise.race([
            supabase.auth.getSession(),
            new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('getSession timeout')), timeoutMs)
            )
        ]);

        const session = result.data.session;

        // Check if token is expired or about to expire (within 60 seconds)
        if (session && session.expires_at) {
            if (session.expires_at <= nowSec + 60) {
                console.log('Token expired or expiring soon, forcing refresh...');
                // Force refresh
                try {
                    const { data: refreshData, error: refreshError } = await Promise.race([
                        supabase.auth.refreshSession(),
                        new Promise<never>((_, reject) =>
                            setTimeout(() => reject(new Error('Refresh timeout')), 5000)
                        )
                    ]);
                    if (!refreshError && refreshData.session) {
                        cachedSession = refreshData.session;
                        cachedSessionExpiry = now + 30000;
                        return { session: refreshData.session, error: null };
                    }
                } catch (refreshErr) {
                    console.warn('Token refresh failed:', refreshErr);
                }
            }
        }

        if (session) {
            cachedSession = session;
            cachedSessionExpiry = now + 30000; // Cache for 30 seconds
        }
        return { session, error: result.error };
    } catch (timeoutError) {
        console.warn('getSession timed out, trying manual token refresh...');

        // Use lock to prevent concurrent refresh attempts
        if (refreshPromise) {
            console.log('Waiting for existing refresh...');
            const session = await refreshPromise;
            return { session, error: null };
        }

        // Try to manually refresh using stored refresh token
        const storedSession = localStorage.getItem(storageKey);
        if (!storedSession) {
            console.log('No stored session found');
            return { session: null, error: null };
        }

        try {
            const parsed = JSON.parse(storedSession);
            if (!parsed.refresh_token) {
                console.log('No refresh token in stored session');
                return { session: null, error: null };
            }

            // Set up refresh promise lock
            refreshPromise = (async () => {
                try {
                    // Manual refresh via REST API
                    const response = await fetch(`${validUrl}/auth/v1/token?grant_type=refresh_token`, {
                        method: 'POST',
                        headers: {
                            'apikey': validKey,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ refresh_token: parsed.refresh_token })
                    });

                    if (!response.ok) {
                        console.error('Manual token refresh failed:', response.status);
                        // DON'T clear localStorage on 400 - might be a race condition
                        // Only clear if it's a definitive auth error (401)
                        if (response.status === 401) {
                            localStorage.removeItem(storageKey);
                        }
                        return null;
                    }

                    const newTokens = await response.json();
                    console.log('Manual token refresh successful');

                    // Update localStorage with new tokens (including new refresh_token)
                    const newSessionData = {
                        access_token: newTokens.access_token,
                        refresh_token: newTokens.refresh_token,
                        expires_at: newTokens.expires_at,
                        expires_in: newTokens.expires_in,
                        token_type: newTokens.token_type,
                        user: newTokens.user
                    };
                    localStorage.setItem(storageKey, JSON.stringify(newSessionData));

                    // Build a Session object directly without calling SDK
                    const session: Session = {
                        access_token: newTokens.access_token,
                        refresh_token: newTokens.refresh_token,
                        expires_at: newTokens.expires_at,
                        expires_in: newTokens.expires_in,
                        token_type: newTokens.token_type || 'bearer',
                        user: newTokens.user
                    };

                    // Cache the new session
                    cachedSession = session;
                    cachedSessionExpiry = Date.now() + 30000;

                    // Try to update SDK state in background (don't await)
                    supabase.auth.setSession({
                        access_token: newTokens.access_token,
                        refresh_token: newTokens.refresh_token
                    }).catch(err => console.warn('setSession background update failed:', err));

                    return session;
                } finally {
                    // Clear lock after 1 second to allow future refreshes
                    setTimeout(() => {
                        refreshPromise = null;
                    }, 1000);
                }
            })();

            const session = await refreshPromise;
            return { session, error: session ? null : new Error('Token refresh failed') };
        } catch (refreshError) {
            console.error('Manual refresh error:', refreshError);
            refreshPromise = null;
            return { session: null, error: refreshError instanceof Error ? refreshError : new Error('Unknown error') };
        }
    }
};

export const signIn = async (email: string, password: string) => {
    try {
        // Add timeout to prevent hanging
        const result = await Promise.race([
            supabase.auth.signInWithPassword({
                email,
                password,
            }),
            new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('Sign in timeout')), 10000)
            )
        ]);
        return result;
    } catch (e) {
        console.error('signIn error or timeout:', e);
        return { data: { user: null, session: null }, error: e instanceof Error ? e : new Error('Unknown error') };
    }
};

export const signUp = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({
        email,
        password,
    });
    return { data, error };
};

export const signOut = async () => {
    // Add timeout to prevent hanging
    const timeoutPromise = new Promise<{ error: Error }>((_, reject) =>
        setTimeout(() => reject(new Error('Sign out timeout')), 5000)
    );

    try {
        const result = await Promise.race([
            supabase.auth.signOut(),
            timeoutPromise
        ]);
        return result;
    } catch (e) {
        console.warn('signOut failed or timed out, clearing local session:', e);
        // Clear local storage even if server call fails
        // Use default Supabase storage key pattern
        const storageKey = `sb-${validUrl.split('//')[1]?.split('.')[0]}-auth-token`;
        localStorage.removeItem(storageKey);
        localStorage.removeItem('linguamaster-auth'); // Also clear old key
        return { error: e instanceof Error ? e : new Error('Unknown error') };
    }
};

export const getUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    return user;
};
