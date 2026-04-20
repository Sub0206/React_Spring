import { Platform } from "react-native";

export const Colors = {
  primary: "#3A86FF",
  primaryDark: "#1E5FD9",
  secondary: "#FF9F1C",
  success: "#06D6A0",
  warning: "#FFBE0B",
  danger: "#EF476F",
  info: "#8338EC",

  bg: "#F4F6F8",
  bgAlt: "#EEF2F6",
  surface: "#FFFFFF",

  textPrimary: "#0F172A",
  textSecondary: "#64748B",
  textMuted: "#94A3B8",

  border: "#E2E8F0",
  borderLight: "#F1F5F9",
};

export const Spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 };
export const Radii = { sm: 8, md: 16, lg: 20, xl: 28, pill: 999 };

const webShadow = (c: string, y: number, blur: number, alpha: number): any =>
  Platform.OS === "web"
    ? { boxShadow: `0px ${y}px ${blur}px rgba(0,0,0,${alpha})` }
    : { shadowColor: "#0F172A", shadowOffset: { width: 0, height: y }, shadowOpacity: alpha, shadowRadius: blur, elevation: Math.round(y / 2) };

export const Shadows = {
  card: webShadow("#0F172A", 4, 12, 0.06),
  button: Platform.OS === "web"
    ? { boxShadow: "0px 6px 12px rgba(58,134,255,0.3)" }
    : { shadowColor: "#3A86FF", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 4 },
};

export const Brand = {
  name: "LendIQ",
  tagline: "Powered by SKYNOTECH",
  logoUrl: "https://images.unsplash.com/photo-1563013544-824ae1b704d3?w=160&q=80",
};
