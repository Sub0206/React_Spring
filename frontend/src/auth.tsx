import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, saveToken, clearToken, getToken } from "./api";
import { clearSessionUnlock, markSessionUnlocked } from "./passcode";

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
  /** OTP request. `purpose='login'|'signup'|'reset'`. */
  sendOtp: (mobile: string, purpose: "signup" | "login" | "reset", name?: string) => Promise<{ demo_otp?: string }>;
  /** OTP verify. Returns `{ user, hasPasscode }` so callers can branch into "set passcode" UX. */
  verifyOtp: (mobile: string, otp: string) => Promise<{ user: User; hasPasscode: boolean }>;
  /** Returning-user login via mobile + 4-digit passcode (no OTP). */
  passcodeLogin: (mobile: string, passcode: string) => Promise<User>;
  /** Forgot-passcode reset: mobile + reset OTP + new passcode → token issued. */
  resetPasscode: (mobile: string, otp: string, passcode: string) => Promise<User>;
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

  const sendOtp = async (mobile: string, purpose: "signup" | "login" | "reset", name?: string) => {
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
    // Just verified via OTP — session is implicitly unlocked.
    markSessionUnlocked();
    return { user: res.user, hasPasscode: !!res.has_passcode };
  };

  const passcodeLogin = async (mobile: string, passcode: string) => {
    const res = await api<{ access_token: string; user: User }>("/auth/passcode-login", {
      method: "POST",
      auth: false,
      body: { mobile, passcode },
    });
    await saveToken(res.access_token);
    setUser(res.user);
    markSessionUnlocked();
    return res.user;
  };

  const resetPasscode = async (mobile: string, otp: string, passcode: string) => {
    const res = await api<{ access_token: string; user: User }>("/auth/reset-passcode", {
      method: "POST",
      auth: false,
      body: { mobile, otp, passcode },
    });
    await saveToken(res.access_token);
    setUser(res.user);
    markSessionUnlocked();
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
    clearSessionUnlock();
    await clearToken();
    setUser(null);
  };

  return (
    <Ctx.Provider
      value={{
        user,
        loading,
        sendOtp,
        verifyOtp,
        passcodeLogin,
        resetPasscode,
        googleExchange,
        logout,
        refresh,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used within AuthProvider");
  return v;
}
