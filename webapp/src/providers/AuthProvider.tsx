'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import * as auth from '@/lib/auth';
import { clearToken, getToken, saveToken } from '@/lib/api';

/**
 * OTP-only auth context. On fresh load we hydrate the JWT from localStorage,
 * call /auth/me to resolve the user, and expose login/logout helpers that the
 * screens under /login and the sidebar consume. No passcode / biometric state
 * is tracked any more.
 */
type Ctx = {
  user: auth.User | null;
  loading: boolean;
  refresh: () => Promise<void>;
  loginWithOtp: (mobile: string, otp: string) => Promise<auth.User>;
  logout: () => Promise<void>;
};

const AuthCtx = createContext<Ctx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<auth.User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const t = getToken();
      if (!t) { setUser(null); return; }
      const me = await auth.me();
      setUser(me);
    } catch {
      clearToken();
      setUser(null);
    }
  }, []);

  useEffect(() => {
    (async () => { await refresh(); setLoading(false); })();
  }, [refresh]);

  const loginWithOtp = async (mobile: string, otp: string) => {
    const r = await auth.verifyOtp(mobile, otp);
    saveToken(r.access_token);
    setUser(r.user);
    return r.user;
  };

  const logout = async () => {
    clearToken();
    setUser(null);
    router.replace('/login');
  };

  return (
    <AuthCtx.Provider value={{ user, loading, refresh, loginWithOtp, logout }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  const v = useContext(AuthCtx);
  if (!v) throw new Error('useAuth must be used within AuthProvider');
  return v;
}
