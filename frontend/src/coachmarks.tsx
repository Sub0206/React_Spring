import React, { useEffect, useState, useCallback } from "react";
import {
  View, Text, StyleSheet, Modal, TouchableOpacity, Animated, Easing,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Colors, Radii, Shadows, Spacing } from "./theme";
import { useThemedStyles } from "./themeContext";

const DONE_KEY = "lendiq_tour_done";

export type CoachStep = {
  icon: keyof typeof Ionicons.glyphMap;
  accentColor: string;
  title: string;
  body: string;
  // Where to anchor the tooltip — simple percentage positions on the screen
  anchor: { topPct?: number; bottomPct?: number; leftPct?: number; rightPct?: number };
  // Optional spotlight ring position (rectangle)
  spot?: { topPct: number; leftPct: number; widthPct: number; heightPct: number };
};

const TABBAR_H = 64;      // approximate bottom tab height
const SCREENS: CoachStep[] = [
  {
    icon: "home",
    accentColor: "#1E40AF",
    title: "Dashboard — your lending cockpit",
    body: "TOTAL FUNDED at the top, Portfolio Health tiles (On Track / Overdue / At Risk / Completed) — tap any tile to drill into filtered loans. Below you'll see the inflow/outflow chart and recent transactions.",
    anchor: { topPct: 10 },
  },
  {
    icon: "document-text",
    accentColor: "#D97706",
    title: "Loan Requests",
    body: "Review pending applications with AI risk score, approve or reject in one tap. Each decision is stamped with date, reason and risk factors for audit.",
    anchor: { topPct: 55 },
  },
  {
    icon: "wallet",
    accentColor: "#10B981",
    title: "Active Loans",
    body: "Filter by On Track · Overdue · At Risk · Completed. Open a loan to mark the CURRENT month as paid, reschedule, or undo a mistaken payment.",
    anchor: { topPct: 55 },
  },
  {
    icon: "people",
    accentColor: "#7C3AED",
    title: "Clients",
    body: "Add new clients, view their KYC, loan history, and statement + CIBIL summaries. Existing loans keep their original approval data — no re-analysis unless you choose to refresh.",
    anchor: { topPct: 55 },
  },
  {
    icon: "bar-chart",
    accentColor: "#DC2626",
    title: "Audit & Reports",
    body: "Profile → Audit & Reports shows month-wise inflow / outflow, reconciliation, and an exceptions list. Download a branded PDF with one click.",
    anchor: { topPct: 40 },
  },
  {
    icon: "person-circle",
    accentColor: "#0F172A",
    title: "Profile — language & subscription",
    body: "Switch the app to Hindi / Tamil / Telugu / Kannada / Malayalam, pick your Starter / Smart Credit / Prime Elite plan, or chat with our AI Guide in Help & Support.",
    anchor: { bottomPct: 15 },
  },
];

export function CoachmarksProvider({ children }: { children: React.ReactNode }) {
  const styles = useScreenStyles();
  const [visible, setVisible] = useState(false);
  const [idx, setIdx] = useState(0);
  const fade = React.useRef(new Animated.Value(0)).current;
  const { width, height } = useWindowDimensions();

  const start = useCallback(() => {
    setIdx(0);
    setVisible(true);
    Animated.timing(fade, { toValue: 1, duration: 260, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [fade]);

  useEffect(() => {
    (async () => {
      try {
        const done = await AsyncStorage.getItem(DONE_KEY);
        if (done !== "1") {
          // Defer a bit so the dashboard has mounted
          setTimeout(start, 700);
        }
      } catch {}
    })();
  }, [start]);

  const finish = useCallback(async () => {
    Animated.timing(fade, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setVisible(false));
    try { await AsyncStorage.setItem(DONE_KEY, "1"); } catch {}
  }, [fade]);

  const next = () => {
    if (idx >= SCREENS.length - 1) { finish(); return; }
    setIdx((i) => i + 1);
  };
  const prev = () => setIdx((i) => Math.max(0, i - 1));

  const step = SCREENS[idx];

  // Tooltip position (percentages → absolute px)
  const tipStyle: any = { position: "absolute", left: Spacing.lg, right: Spacing.lg };
  if (step?.anchor.topPct != null)    tipStyle.top    = (height * step.anchor.topPct) / 100;
  if (step?.anchor.bottomPct != null) tipStyle.bottom = (height * step.anchor.bottomPct) / 100;

  return (
    <>
      {children}
      <Modal visible={visible} transparent animationType="none" statusBarTranslucent>
        <Animated.View style={[styles.dim, { opacity: fade }]}>
          {/* Step tooltip */}
          <Animated.View style={[styles.tip, tipStyle, { opacity: fade }]}>
            <View style={[styles.iconCircle, { backgroundColor: step.accentColor + "15" }]}>
              <Ionicons name={step.icon} size={22} color={step.accentColor} />
            </View>
            <Text style={styles.title}>{step.title}</Text>
            <Text style={styles.body}>{step.body}</Text>
            <View style={styles.dots}>
              {SCREENS.map((_, i) => (
                <View key={i} style={[styles.dot, i === idx && { backgroundColor: step.accentColor, width: 18 }]} />
              ))}
            </View>
            <View style={styles.controls}>
              {idx > 0 ? (
                <TouchableOpacity onPress={prev} testID="tour-prev" style={styles.btnGhost}>
                  <Text style={styles.btnGhostTxt}>Back</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity onPress={finish} testID="tour-skip" style={styles.btnGhost}>
                  <Text style={styles.btnGhostTxt}>Skip</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={next}
                testID="tour-next"
                style={[styles.btnPrimary, { backgroundColor: step.accentColor }]}
              >
                <Text style={styles.btnPrimaryTxt}>{idx === SCREENS.length - 1 ? "Done" : "Next"}</Text>
                <Ionicons
                  name={idx === SCREENS.length - 1 ? "checkmark" : "arrow-forward"}
                  size={16}
                  color="#fff"
                />
              </TouchableOpacity>
            </View>
          </Animated.View>
          {/* Close X top-right */}
          <TouchableOpacity onPress={finish} style={styles.close} testID="tour-close">
            <Ionicons name="close" size={22} color="#fff" />
          </TouchableOpacity>
          <View style={styles.brandStrip}>
            <Ionicons name="sparkles" size={14} color="#fff" />
            <Text style={styles.brandTxt}>LendIQ guided tour · Step {idx + 1} of {SCREENS.length}</Text>
          </View>
        </Animated.View>
      </Modal>
    </>
  );
}

export async function resetCoachmarks() {
  try { await AsyncStorage.removeItem(DONE_KEY); } catch {}
}

function useScreenStyles() {
  return useThemedStyles(() => StyleSheet.create({
  dim: { flex: 1, backgroundColor: "rgba(15,23,42,0.74)" },
  close: { position: "absolute", top: 50, right: 18, width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center" },
  brandStrip: { position: "absolute", top: 54, left: 18, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.12)", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  brandTxt: { color: "#fff", fontWeight: "700", fontSize: 11, letterSpacing: 0.3 },
  tip: {
    backgroundColor: "#fff", borderRadius: Radii.xl, padding: Spacing.lg, ...Shadows.card,
  },
  iconCircle: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  title: { fontSize: 17, fontWeight: "800", color: Colors.textPrimary, letterSpacing: -0.2 },
  body: { fontSize: 13.5, color: Colors.textSecondary, lineHeight: 20, marginTop: 8 },
  dots: { flexDirection: "row", gap: 6, marginTop: Spacing.md, alignSelf: "center" },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#E2E8F0" },
  controls: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: Spacing.lg },
  btnGhost: { paddingHorizontal: 16, paddingVertical: 10 },
  btnGhostTxt: { color: Colors.textSecondary, fontWeight: "700", fontSize: 13 },
  btnPrimary: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 18, paddingVertical: 10, borderRadius: Radii.pill },
  btnPrimaryTxt: { color: "#fff", fontWeight: "800", fontSize: 13, letterSpacing: 0.2 },
  }));
}

