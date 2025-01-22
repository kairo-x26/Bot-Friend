import type { MeResponse } from '@bot-friend/shared';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AdminApiError, request, setUnauthorizedHandler, tokenStore } from './api';

interface AuthState {
  me: MeResponse | null;
  loading: boolean;
  signIn(token: string): Promise<void>;
  signOut(): void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const signOut = useCallback(() => {
    tokenStore.clear();
    setMe(null);
  }, []);

  const signIn = useCallback(async (token: string) => {
    const profile = await request<MeResponse>('GET', '/v1/me', undefined, token);
    if (profile.user.role === 'user') {
      throw new AdminApiError(403, 'forbidden', 'This account doesn’t have moderator access.');
    }
    tokenStore.set(token);
    setMe(profile);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(signOut);
    const token = tokenStore.get();
    if (!token) {
      setLoading(false);
      return;
    }
    signIn(token)
      .catch(() => signOut())
      .finally(() => setLoading(false));
  }, [signIn, signOut]);

  const value = useMemo(() => ({ me, loading, signIn, signOut }), [me, loading, signIn, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}
