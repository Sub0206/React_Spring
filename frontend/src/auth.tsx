import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, saveToken, clearToken, getToken } from "./api";

export type User = {
  user_id: string;
  mobile: string;
  name: string;
  email?: string | null;
  picture?: string | null;
  role: string;
};

type AuthCtx = {
  user: User | null;
  loading: boolean;
  sendOtp: (mobile: string, purpose: "signup" | "login", name?: string) => Promise<{ demo_otp?: string }>;
  verifyOtp: (mobile: string, otp: string) => Promise<void>;
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
      if (!t) {
        setUser(null);
        return;
      }
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
    const res = await api<{ access_token: string; user: User }>("/auth/verify-otp", {
      method: "POST",
      auth: false,
      body: { mobile, otp },
    });
    await saveToken(res.access_token);
    setUser(res.user);
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
