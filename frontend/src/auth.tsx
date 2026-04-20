import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, saveToken, clearToken, getToken } from "./api";

export type User = {
  user_id: string;
  email: string;
  name: string;
  picture?: string | null;
  role: string;
};

type AuthCtx = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
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

  const login = async (email: string, password: string) => {
    const res = await api<{ access_token: string; user: User }>("/auth/login", {
      method: "POST",
      auth: false,
      body: { email, password },
    });
    await saveToken(res.access_token);
    setUser(res.user);
  };

  const register = async (email: string, password: string, name: string) => {
    const res = await api<{ access_token: string; user: User }>("/auth/register", {
      method: "POST",
      auth: false,
      body: { email, password, name },
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
    <Ctx.Provider value={{ user, loading, login, register, googleExchange, logout, refresh }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used within AuthProvider");
  return v;
}
