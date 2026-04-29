import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { applyTheme, Colors, type ThemeMode } from "./theme";

type Ctx = {
  mode: ThemeMode;
  resolved: "light" | "dark";
  setMode: (m: ThemeMode) => Promise<void>;
  ready: boolean;
  /** increments every time the theme is applied — use as `key={remountKey}` on app root */
  remountKey: number;
};

const ThemeCtx = createContext<Ctx>({
  mode: "dark", resolved: "dark", setMode: async () => {}, ready: false, remountKey: 0,
});
const STORAGE_KEY = "lendiq_theme_mode";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const systemIsDark = systemScheme === "dark";
  const [mode, setModeState] = useState<ThemeMode>("dark");
  const [ready, setReady] = useState(false);
  const [remountKey, setRemountKey] = useState(0);
  const didInit = useRef(false);

  // Initial load from AsyncStorage
  useEffect(() => {
    (async () => {
      let initialMode: ThemeMode = "dark";
      try {
        const v = (await AsyncStorage.getItem(STORAGE_KEY)) as ThemeMode | null;
        if (v === "light" || v === "dark" || v === "system") initialMode = v;
      } catch { /* ignore */ }
      applyTheme(initialMode, systemIsDark);
      setModeState(initialMode);
      setRemountKey((k) => k + 1);
      setReady(true);
      didInit.current = true;
    })();
  }, [systemIsDark]);

  // If user picked "system" and OS theme changes, re-apply
  useEffect(() => {
    if (!didInit.current || mode !== "system") return;
    applyTheme("system", systemIsDark);
    setRemountKey((k) => k + 1);
  }, [systemIsDark, mode]);

  const setMode = useCallback(async (next: ThemeMode) => {
    setModeState(next);
    try { await AsyncStorage.setItem(STORAGE_KEY, next); } catch { /* ignore */ }
    applyTheme(next, systemIsDark);
    setRemountKey((k) => k + 1);
  }, [systemIsDark]);

  const value = useMemo<Ctx>(() => ({
    mode,
    resolved: mode === "system" ? (systemIsDark ? "dark" : "light") : mode,
    setMode,
    ready,
    remountKey,
  }), [mode, systemIsDark, setMode, ready, remountKey]);

  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export function useTheme() { return useContext(ThemeCtx); }

/**
 * Hook for building theme-reactive styles.
 *
 * Usage:
 *   const styles = useThemedStyles((C) => StyleSheet.create({
 *     safe: { flex: 1, backgroundColor: C.bg },
 *     title: { color: C.textPrimary },
 *   }));
 *
 * The factory receives the live `Colors` palette and re-runs whenever the
 * resolved theme ("light" | "dark") or remountKey changes — which means
 * every screen automatically restyles on theme switch without an app reload.
 */
export function useThemedStyles<T>(factory: (c: typeof Colors) => T): T {
  const { resolved, remountKey } = useContext(ThemeCtx);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => factory(Colors), [resolved, remountKey]);
}
