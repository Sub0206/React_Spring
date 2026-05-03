import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, saveToken, clearToken, getToken } from "./api";

/**
 * OTP-ONLY AUTH (mobile) — 2026-05-03
 *
 * The mobile app authenticates EXCLUSIVELY via OTP:
 *   1. sendOtp(mobile, 'login' | 'signup', name?)  → backend stores OTP, returns demo_otp in dev
 *   2. verifyOtp(mobile, otp)                      → backend returns JWT + user
 *
 * JWT is valid for 30 days. No passcode, no biometric, no session-unlock gate.
 * Relaunching the app with a valid token drops the user straight on the
 * dashboard. Token expiry routes back to /login where a fresh OTP is requested.
 */

export type User = {
  user_id: string;
  mobile: string;
  name: string;
  email?: string | null;
  picture?: string | null;
  role: string;
  subscription_plan?: string | null;
  subscription_status?: string | null;
};

type AuthCtx = {
  user: User | null;
  loading: boolean;
  sendOtp: (mobile: string, purpose: "signup" | "login", name?: string) => Promise<{ demo_otp?: string }>;
  verifyOtp: (mobile: string, otp: string) => Promise<User>;
  googleExchange: (sessionId: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const t = await getToken();
      if (!t) { setUser(null); return; }
      const me = await api<User>("/auth/me");
      setUser(me);
    } catch {
      await clearToken();
      setUser(null);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await refresh();
      setLoading(false);
    })();
  }, [refresh]);

  const sendOtp = async (mobile: string, purpose: "signup" | "login", name?: string) => {
    return await api<{ demo_otp?: string }>("/auth/send-otp", {
      method: "POST",
      auth: false,
      body: { mobile, purpose, name },
    });
  };

  const verifyOtp = async (mobile: string, otp: string) => {
    const res = await api<{ access_token: string; user: User; has_passcode?: boolean }>(
      "/auth/verify-otp",
      { method: "POST", auth: false, body: { mobile, otp } }
    );
    await saveToken(res.access_token);
    setUser(res.user);
    return res.user;
  };

  const googleExchange = async (sessionId: string) => {
    const res = await api<{ access_token: string; user: User }>("/auth/google", {
      method: "POST",
      auth: false,
      body: { session_id: sessionId },
    });
    await saveToken(res.access_token);
    setUser(res.user);
  };

  const logout = async () => {
    await clearToken();
    setUser(null);
  };

  return (
    <Ctx.Provider value={{ user, loading, sendOtp, verifyOtp, googleExchange, logout, refresh }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used within AuthProvider");
  return v;
}
