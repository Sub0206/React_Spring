import { Platform } from "react-native";

// Premium fintech palette — Royal Blue, Emerald, Gold, Crimson
export const Colors = {
  // Primary — Royal Blue
  primary: "#1E40AF",
  primaryDark: "#1E3A8A",
  primaryLight: "#3B82F6",
  primarySoft: "#DBEAFE",

  // Secondary — Emerald Green
  secondary: "#10B981",
  secondaryDark: "#059669",
  secondarySoft: "#D1FAE5",

  // Gold accent for premium feel
  gold: "#D4AF37",
  goldSoft: "#FEF3C7",

  // Success — Elegant Emerald
  success: "#059669",
  successSoft: "#D1FAE5",

  // Warning — warm amber
  warning: "#D97706",
  warningSoft: "#FEF3C7",

  // Danger / Overdue — Premium Crimson
  danger: "#DC2626",
  dangerDark: "#B91C1C",
  dangerSoft: "#FEE2E2",

  // Info — deep cyan
  info: "#0EA5E9",
  infoSoft: "#E0F2FE",

  // Backgrounds — soft layered surface
  bg: "#F8FAFC",
  bgAlt: "#F1F5F9",
  surface: "#FFFFFF",
  surfaceAlt: "#FAFBFE",

  // Text hierarchy
  textPrimary: "#0F172A",
  textSecondary: "#475569",
  textMuted: "#94A3B8",

  // Borders / dividers
  border: "#E2E8F0",
  borderLight: "#F1F5F9",
  borderSubtle: "#EDF2F7",
};

export const Spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 };
export const Radii = { sm: 8, md: 14, lg: 20, xl: 28, pill: 999 };

const shadow = (y: number, blur: number, alpha: number, color = "15,23,42") => (
  Platform.OS === "web"
    ? { boxShadow: `0px ${y}px ${blur}px rgba(${color},${alpha})` }
    : { shadowColor: "#0F172A", shadowOffset: { width: 0, height: y }, shadowOpacity: alpha, shadowRadius: blur, elevation: Math.round(y / 2) }
);

export const Shadows = {
  // Subtle floating card
  card: shadow(2, 10, 0.05),
  // Elevated / hover / prominent
  cardHigh: shadow(8, 24, 0.08),
  // Primary CTA buttons
  button: Platform.OS === "web"
    ? { boxShadow: "0px 8px 20px rgba(30,64,175,0.25)" }
    : { shadowColor: "#1E40AF", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.25, shadowRadius: 14, elevation: 4 },
  // Danger CTA / overdue card accent
  danger: Platform.OS === "web"
    ? { boxShadow: "0px 6px 16px rgba(220,38,38,0.18)" }
    : { shadowColor: "#DC2626", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 10, elevation: 3 },
  // Gold — premium highlight
  gold: Platform.OS === "web"
    ? { boxShadow: "0px 6px 16px rgba(212,175,55,0.22)" }
    : { shadowColor: "#D4AF37", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.22, shadowRadius: 10, elevation: 3 },
};

export const Brand = {
  name: "LendIQ",
  tagline: "Powered by SKYNOTECH",
  logoUrl: "https://images.unsplash.com/photo-1563013544-824ae1b704d3?w=160&q=80",
};
