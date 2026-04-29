import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { api, saveToken, clearToken, getToken } from "./api";
import { checkHasPasscode } from "./passcode";

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

/** Re-lock the app after this many ms of being in actual background.
 * Brief 'inactive' transitions (file picker, share sheet, permission dialog,
 * keyboard) MUST NOT trip the re-lock — that's what caused "passcode keeps
 * asking" on the first native build. */
const RELOCK_AFTER_BG_MS = 30_000;

type AuthCtx = {
  user: User | null;
  loading: boolean;
  /** True when the current session has been unlocked by passcode (or just-issued
   * OTP/passcode-login). When false AND the user has a server-side passcode,
   * AuthGate forces the passcode screen. */
  sessionUnlocked: boolean;
  setSessionUnlocked: (v: boolean) => void;
  sendOtp: (mobile: string, purpose: "signup" | "login" | "reset", name?: string) => Promise<{ demo_otp?: string }>;
  verifyOtp: (mobile: string, otp: string) => Promise<{ user: User; hasPasscode: boolean }>;
  passcodeLogin: (mobile: string, passcode: string) => Promise<User>;
  resetPasscode: (mobile: string, otp: string, passcode: string) => Promise<User>;
  googleExchange: (sessionId: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionUnlocked, setSessionUnlocked] = useState<boolean>(false);

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

  // ---- AppState-driven re-lock ----
  // Only re-lock when the app was REALLY backgrounded for >= RELOCK_AFTER_BG_MS.
  // This avoids the document-picker / share-sheet false positives that made the
  // passcode screen "keep asking" on native.
  useEffect(() => {
    let lastBgAt: number | null = null;
    let lastState: AppStateStatus = AppState.currentState;
    const sub = AppState.addEventListener("change", async (next) => {
      // Track when we went down. Use 'background' specifically — 'inactive'
      // is too noisy on iOS (file pickers, control center swipes).
      if (next === "background") {
        lastBgAt = Date.now();
      } else if (next === "active" && lastState !== "active") {
        const downAt = lastBgAt;
        lastBgAt = null;
        if (!user || !downAt) return;
        const elapsed = Date.now() - downAt;
        if (elapsed < RELOCK_AFTER_BG_MS) return;
        try {
          const has = await checkHasPasscode(user.mobile);
          if (has) setSessionUnlocked(false);
        } catch {/* ignore network failures */}
      }
      lastState = next;
    });
    return () => sub.remove();
  }, [user]);

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
    setSessionUnlocked(true);
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
    setSessionUnlocked(true);
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
    setSessionUnlocked(true);
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
    setSessionUnlocked(true);
  };

  const logout = async () => {
    setSessionUnlocked(false);
    await clearToken();
    setUser(null);
  };

  return (
    <Ctx.Provider
      value={{
        user,
        loading,
        sessionUnlocked,
        setSessionUnlocked,
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
