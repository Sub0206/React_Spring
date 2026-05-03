'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import * as auth from '@/lib/auth';
import { clearToken, getToken, saveToken } from '@/lib/api';

type Ctx = {
  user: auth.User | null;
  loading: boolean;
  /** True when the session has been unlocked this browser session (tab).
   * Mirrors the mobile app semantics: fresh load = locked until passcode
   * succeeds (for users with a server-side passcode). */
  sessionUnlocked: boolean;
  setSessionUnlocked: (v: boolean) => void;
  hasServerPasscode: boolean | null;
  refresh: () => Promise<void>;
  loginWithOtp: (mobile: string, otp: string) => Promise<{ user: auth.User; hasPasscode: boolean }>;
  loginWithPasscode: (mobile: string, passcode: string) => Promise<auth.User>;
  resetPasscode: (mobile: string, otp: string, passcode: string) => Promise<auth.User>;
  logout: () => Promise<void>;
};

const AuthCtx = createContext<Ctx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<auth.User | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionUnlocked, setSessionUnlocked] = useState(false);
  const [hasServerPasscode, setHasServerPasscode] = useState<boolean | null>(null);

  const refresh = useCallback(async () => {
    try {
      const t = getToken();
      if (!t) { setUser(null); setHasServerPasscode(null); return; }
      const me = await auth.me();
      setUser(me);
      const has = await auth.checkHasPasscode(me.mobile);
      if (has !== null) setHasServerPasscode(has);
    } catch {
      clearToken();
      setUser(null);
      setHasServerPasscode(null);
    }
  }, []);

  useEffect(() => {
    (async () => { await refresh(); setLoading(false); })();
  }, [refresh]);

  const loginWithOtp = async (mobile: string, otp: string) => {
    const r = await auth.verifyOtp(mobile, otp);
    saveToken(r.access_token);
    setUser(r.user);
    setSessionUnlocked(true);
    setHasServerPasscode(!!r.has_passcode);
    return { user: r.user, hasPasscode: !!r.has_passcode };
  };

  const loginWithPasscode = async (mobile: string, passcode: string) => {
    const r = await auth.passcodeLogin(mobile, passcode);
    saveToken(r.access_token);
    setUser(r.user);
    setSessionUnlocked(true);
    setHasServerPasscode(true);
    return r.user;
  };

  const resetPasscode = async (mobile: string, otp: string, passcode: string) => {
    const r = await auth.resetPasscode(mobile, otp, passcode);
    saveToken(r.access_token);
    setUser(r.user);
    setSessionUnlocked(true);
    setHasServerPasscode(true);
    return r.user;
  };

  const logout = async () => {
    clearToken();
    setUser(null);
    setSessionUnlocked(false);
    setHasServerPasscode(null);
    router.replace('/login');
  };

  return (
    <AuthCtx.Provider
      value={{
        user,
        loading,
        sessionUnlocked,
        setSessionUnlocked,
        hasServerPasscode,
        refresh,
        loginWithOtp,
        loginWithPasscode,
        resetPasscode,
        logout,
      }}
    >
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  const v = useContext(AuthCtx);
  if (!v) throw new Error('useAuth must be used within AuthProvider');
  return v;
}
