import { Platform } from "react-native";

// LendIQ – Executive Dark Navy (premium fintech theme, iteration 21)
// Layered dark surfaces, electric royal-blue accents, emerald/teal highlights.
// Tokens are preserved 1:1 with the prior light theme so all screens inherit
// the new palette without code changes.

export const Colors = {
  // Primary — Electric Royal Blue (pops on dark bg)
  primary: "#3B82F6",          // blue-500
  primaryDark: "#2563EB",      // blue-600
  primaryLight: "#60A5FA",     // blue-400
  primarySoft: "#1E3A5F",      // deep blue tint for translucent cards

  // Secondary — Emerald
  secondary: "#10B981",
  secondaryDark: "#059669",
  secondarySoft: "#0B3F2E",

  // Gold — premium highlight (use sparingly)
  gold: "#FBBF24",
  goldSoft: "#78350F",

  // Success — Emerald (matches secondary)
  success: "#10B981",
  successSoft: "#0B3F2E",

  // Warning — Amber
  warning: "#F59E0B",
  warningSoft: "#7C4A10",

  // Danger / Overdue — Crimson
  danger: "#EF4444",
  dangerDark: "#DC2626",
  dangerSoft: "#5A1A1A",

  // Info — Cyan
  info: "#22D3EE",
  infoSoft: "#113F4B",

  // Accent — Deep Teal (premium callouts)
  accent: "#14B8A6",
  accentSoft: "#0F3D3A",

  // Backgrounds — layered dark navy
  bg: "#0B1220",           // page background (deepest)
  bgAlt: "#131C2E",        // secondary panel / inline tiles
  surface: "#1B273F",      // primary card surface
  surfaceAlt: "#243049",   // elevated / selected card

  // Text hierarchy
  textPrimary: "#F8FAFC",      // slate-50
  textSecondary: "#CBD5E1",    // slate-300
  textMuted: "#94A3B8",        // slate-400

  // Borders / dividers
  border: "#334155",           // slate-700 (strongest)
  borderLight: "#263149",      // subtle card border
  borderSubtle: "#1D2740",     // hairline divider
};

export const Spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 };
export const Radii = { sm: 8, md: 14, lg: 20, xl: 28, pill: 999 };

// Shadows on a dark bg are mostly invisible — we add a subtle inner-glow-ish
// effect on web + keep native shadows for iOS/Android depth. Each card should
// also carry `borderWidth: 1, borderColor: Colors.borderLight` for crispness
// (see src/ui.tsx Card).
const webShadow = (y: number, blur: number, alpha: number) =>
  ({ boxShadow: `0px ${y}px ${blur}px rgba(0,0,0,${alpha})` });

const nativeShadow = (y: number, blur: number, alpha: number) => ({
  shadowColor: "#000000",
  shadowOffset: { width: 0, height: y },
  shadowOpacity: alpha,
  shadowRadius: blur,
  elevation: Math.round(y / 2),
});

const shadow = (y: number, blur: number, alpha: number) =>
  Platform.OS === "web" ? webShadow(y, blur, alpha) : nativeShadow(y, blur, alpha);

export const Shadows = {
  card: shadow(3, 14, 0.25),
  cardHigh: shadow(10, 30, 0.35),
  button:
    Platform.OS === "web"
      ? { boxShadow: "0px 8px 24px rgba(59,130,246,0.45)" }
      : { shadowColor: "#3B82F6", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.45, shadowRadius: 14, elevation: 6 },
  danger:
    Platform.OS === "web"
      ? { boxShadow: "0px 6px 18px rgba(239,68,68,0.35)" }
      : { shadowColor: "#EF4444", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 12, elevation: 4 },
  gold:
    Platform.OS === "web"
      ? { boxShadow: "0px 6px 18px rgba(251,191,36,0.32)" }
      : { shadowColor: "#FBBF24", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.32, shadowRadius: 12, elevation: 4 },
};

export const Brand = {
  name: "LendIQ",
  tagline: "Powered by SKYNOTECH",
  logoUrl: "https://images.unsplash.com/photo-1563013544-824ae1b704d3?w=160&q=80",
};
