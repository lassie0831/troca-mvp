import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, ApiError, onSessionExpired, tokenStore, type AuthResponse } from '@/api';

type Status = 'loading' | 'signedIn' | 'signedOut';

interface AuthContextValue {
  status: Status;
  signIn(email: string, password: string): Promise<void>;
  signUp(data: { name: string; email: string; password: string; neighborhood: string }): Promise<void>;
  signOut(): Promise<void>;
  /** Clears the local session after the account was deleted server-side. */
  forgetSession(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const queryClient = useQueryClient();

  const resetToSignedOut = useCallback(() => {
    queryClient.clear();
    setStatus('signedOut');
  }, [queryClient]);

  useEffect(() => {
    onSessionExpired(resetToSignedOut);
    (async () => {
      if (!(await tokenStore.load())) return setStatus('signedOut');
      try {
        queryClient.setQueryData(['me'], await api.me());
        setStatus('signedIn');
      } catch (err) {
        // Offline at startup: keep the session; requests will retry when back online.
        if (err instanceof ApiError && err.status === 0) setStatus('signedIn');
        else {
          await tokenStore.clear();
          setStatus('signedOut');
        }
      }
    })();
    return () => onSessionExpired(null);
  }, [queryClient, resetToSignedOut]);

  const startSession = useCallback(
    async (res: AuthResponse) => {
      await tokenStore.set({ accessToken: res.accessToken, refreshToken: res.refreshToken });
      queryClient.clear();
      queryClient.setQueryData(['me'], res.user);
      setStatus('signedIn');
    },
    [queryClient],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      signIn: async (email, password) => startSession(await api.login({ email, password })),
      signUp: async (data) => startSession(await api.register(data)),
      signOut: async () => {
        const tokens = tokenStore.get();
        if (tokens) await api.logout(tokens.refreshToken).catch(() => undefined);
        await tokenStore.clear();
        resetToSignedOut();
      },
      forgetSession: async () => {
        await tokenStore.clear();
        resetToSignedOut();
      },
    }),
    [status, startSession, resetToSignedOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
