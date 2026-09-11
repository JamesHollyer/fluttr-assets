import type { Session, User } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';

import { supabase } from './supabase';

type AuthState = {
  configured: boolean;
  loading: boolean;
  session: Session | null;
  user: User | null;
  /** Emails a sign-in link that opens the app (and a code, when the mail template includes one). */
  sendCode: (email: string) => Promise<void>;
  verifyCode: (email: string, code: string) => Promise<void>;
  /** Development builds only: password sign-in for test accounts. */
  signInWithPassword: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

/**
 * Where the sign-in email's link lands. On Android, email apps' built-in browsers
 * refuse a redirect straight to a custom scheme but honour Chrome's intent:// form,
 * which launches the app (fluttr://auth-callback?code=…). iOS opens the scheme directly.
 */
export const AUTH_REDIRECT_URL =
  Platform.OS === 'android'
    ? 'intent://auth-callback#Intent;scheme=fluttr;package=com.fluttr.app;end'
    : Linking.createURL('auth-callback');

/** Pull session tokens (or an error) out of a magic-link redirect URL. */
function parseAuthUrl(url: string): { accessToken?: string; refreshToken?: string; code?: string; error?: string } | null {
  if (!url.includes('auth-callback')) return null;
  const params = new URLSearchParams(url.split(/[#?]/).slice(1).join('&'));
  return {
    accessToken: params.get('access_token') ?? undefined,
    refreshToken: params.get('refresh_token') ?? undefined,
    code: params.get('code') ?? undefined,
    error: params.get('error_description') ?? params.get('error') ?? undefined,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(Boolean(supabase));

  useEffect(() => {
    if (!supabase) return;
    supabase.auth
      .getSession()
      .then(({ data }) => setSession(data.session))
      .finally(() => setLoading(false));
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));

    // The sign-in email links back into the app; finish the sign-in from the URL.
    const handleUrl = async (url: string | null) => {
      if (!url || !supabase) return;
      const parsed = parseAuthUrl(url);
      if (!parsed) return;
      if (parsed.error) {
        console.warn('Sign-in link error:', parsed.error);
        return;
      }
      if (parsed.accessToken && parsed.refreshToken) {
        await supabase.auth.setSession({ access_token: parsed.accessToken, refresh_token: parsed.refreshToken });
      } else if (parsed.code) {
        await supabase.auth.exchangeCodeForSession(parsed.code);
      }
    };
    Linking.getInitialURL().then(handleUrl).catch(console.warn);
    const linkSub = Linking.addEventListener('url', ({ url }) => {
      handleUrl(url).catch(console.warn);
    });

    return () => {
      data.subscription.unsubscribe();
      linkSub.remove();
    };
  }, []);

  const sendCode = useCallback(async (email: string) => {
    if (!supabase) throw new Error('Sync is not set up in this build.');
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: true, emailRedirectTo: AUTH_REDIRECT_URL },
    });
    if (error) throw error;
  }, []);

  const verifyCode = useCallback(async (email: string, code: string) => {
    if (!supabase) throw new Error('Sync is not set up in this build.');
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' });
    if (error) throw error;
  }, []);

  const signInWithPassword = useCallback(async (email: string, password: string) => {
    if (!supabase) throw new Error('Sync is not set up in this build.');
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }, []);

  const value = useMemo<AuthState>(
    () => ({ configured: Boolean(supabase), loading, session, user: session?.user ?? null, sendCode, verifyCode, signInWithPassword, signOut }),
    [loading, session, sendCode, verifyCode, signInWithPassword, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
