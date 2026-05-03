import { Platform } from "react-native";

// LendIQ theme — supports Light, Dark and System modes.
// Colors is exported as a mutable object; `applyTheme(mode)` overwrites its
// values in-place so existing StyleSheets (created once at module load) can
// be refreshed via a root-level `key` remount (see ThemeProvider).

type ThemeMode = "light" | "dark" | "system";

// Shared structural tokens
export const Spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 };
export const Radii   = { sm: 8, md: 14, lg: 20, xl: 28, pill: 999 };

export const Brand = {
  name: "LendIQ",
  tagline: "Powered by SKYNOTECH",
  logoUrl: "https://images.unsplash.com/photo-1563013544-824ae1b704d3?w=160&q=80",
};

// ---- Palettes -----------------------------------------------------------
const DARK = {
  primary: "#3B82F6", primaryDark: "#2563EB", primaryLight: "#60A5FA", primarySoft: "#1E3A5F",
  secondary: "#10B981", secondaryDark: "#059669", secondarySoft: "#0B3F2E",
  gold: "#FBBF24", goldSoft: "#78350F",
  success: "#10B981", successSoft: "#0B3F2E",
  // Dark-mode readability: brighter warning (yellow) and danger (red) so text
  // stays legible on navy surfaces. Tints match WCAG AA contrast.
  warning: "#FFD166", warningSoft: "#7C4A10",
  danger: "#FF6B6B", dangerDark: "#FF4D4F", dangerSoft: "#5A1A1A",
  // Dedicated loan-risk tokens used by the status classifier. Kept separate
  // from the generic warning/danger so we can tune them independently later.
  riskMild: "#FFD166", riskMildSoft: "#3F2E10", riskMildBorder: "#8A6A1E",
  riskHigh: "#FF6B6B", riskHighSoft: "#441718", riskHighBorder: "#8F2F31",
  info: "#22D3EE", infoSoft: "#113F4B",
  accent: "#14B8A6", accentSoft: "#0F3D3A",
  bg: "#0B1220", bgAlt: "#131C2E", surface: "#1B273F", surfaceAlt: "#243049",
  textPrimary: "#F8FAFC", textSecondary: "#CBD5E1", textMuted: "#94A3B8",
  border: "#334155", borderLight: "#263149", borderSubtle: "#1D2740",
};

const LIGHT = {
  primary: "#1E40AF", primaryDark: "#1E3A8A", primaryLight: "#3B82F6", primarySoft: "#DBEAFE",
  secondary: "#10B981", secondaryDark: "#059669", secondarySoft: "#D1FAE5",
  gold: "#D4AF37", goldSoft: "#FEF3C7",
  success: "#059669", successSoft: "#D1FAE5",
  warning: "#D97706", warningSoft: "#FEF3C7",
  danger: "#DC2626", dangerDark: "#B91C1C", dangerSoft: "#FEE2E2",
  riskMild: "#B7791F", riskMildSoft: "#FEF3C7", riskMildBorder: "#F5C77E",
  riskHigh: "#C4362A", riskHighSoft: "#FEE2E2", riskHighBorder: "#F28C87",
  info: "#0EA5E9", infoSoft: "#E0F2FE",
  accent: "#0D9488", accentSoft: "#CCFBF1",
  bg: "#F8FAFC", bgAlt: "#F1F5F9", surface: "#FFFFFF", surfaceAlt: "#FAFBFE",
  textPrimary: "#0F172A", textSecondary: "#475569", textMuted: "#94A3B8",
  border: "#E2E8F0", borderLight: "#F1F5F9", borderSubtle: "#EDF2F7",
};

// Live mutable Colors object — starts on DARK (premium default); remounts on toggle.
export const Colors: typeof DARK = { ...DARK };

// Shadow objects rebuilt whenever palette changes so the CTA glow uses the
// correct primary tint.
export let Shadows = buildShadows(DARK);

function buildShadows(p: typeof DARK) {
  const webShadow = (y: number, blur: number, alpha: number, colorRgb = "0,0,0") =>
    ({ boxShadow: `0px ${y}px ${blur}px rgba(${colorRgb},${alpha})` });
  const nativeShadow = (y: number, blur: number, alpha: number, color = "#000") => ({
    shadowColor: color, shadowOffset: { width: 0, height: y },
    shadowOpacity: alpha, shadowRadius: blur, elevation: Math.round(y / 2),
  });
  const isDark = p.bg.startsWith("#0") || p.bg.startsWith("#1");
  const baseShadow = (y: number, b: number, a: number) =>
    Platform.OS === "web" ? webShadow(y, b, isDark ? a : a * 0.4) : nativeShadow(y, b, isDark ? a : a * 0.5);
  // primary-tinted CTA shadow
  const rgbFromHex = (hex: string) => {
    const n = parseInt(hex.replace("#", ""), 16);
    return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
  };
  const cta = (hex: string, alpha: number) =>
    Platform.OS === "web"
      ? { boxShadow: `0px 6px 18px rgba(${rgbFromHex(hex)},${alpha})` }
      : { shadowColor: hex, shadowOffset: { width: 0, height: 6 }, shadowOpacity: alpha, shadowRadius: 14, elevation: 6 };
  return {
    card: baseShadow(3, 14, 0.25),
    cardHigh: baseShadow(10, 30, 0.35),
    button: cta(p.primary, isDark ? 0.45 : 0.25),
    danger: cta(p.danger, 0.25),
    gold: cta(p.gold, 0.28),
  } as Record<string, any>;
}

// ---- Theme switch API --------------------------------------------------
export function applyTheme(mode: ThemeMode, systemIsDark: boolean) {
  const resolved: "light" | "dark" =
    mode === "system" ? (systemIsDark ? "dark" : "light") : mode;
  const target = resolved === "dark" ? DARK : LIGHT;
  // Mutate in-place so all importers see the new values
  Object.assign(Colors, target);
  Shadows = buildShadows(target);
  return resolved;
}

export type { ThemeMode };
