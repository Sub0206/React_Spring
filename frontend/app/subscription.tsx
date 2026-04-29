import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Radii, Shadows, Spacing } from "../src/theme";
import { PrimaryButton } from "../src/ui";
import { useI18n } from "../src/i18n";
import { useAuth } from "../src/auth";
import { useThemedStyles } from "../src/themeContext";

type Plan = {
  key: "starter" | "smart" | "prime";
  name: string;
  subtitle: string;
  monthly: number;
  yearly: number;
  color: string;
  accent: string;
  features: string[];
  badge?: string;
};

const PLANS: Plan[] = [
  {
    key: "starter",
    name: "Starter",
    subtitle: "For individual lenders getting started",
    monthly: 499,
    yearly: 4990,
    color: "#64748B",
    accent: "#F1F5F9",
    features: [
      "Up to 25 active clients",
      "Basic AI credit scoring",
      "Custom EMI schedules",
      "Email support",
    ],
  },
  {
    key: "smart",
    name: "Smart Credit",
    subtitle: "For growing lending businesses",
    monthly: 1499,
    yearly: 14990,
    color: "#1E40AF",
    accent: "#DBEAFE",
    badge: "POPULAR",
    features: [
      "Up to 250 active clients",
      "Advanced AI scoring + CIBIL",
      "Bank statement AI analyzer",
      "Branded PDF reports",
      "Priority chat support",
    ],
  },
  {
    key: "prime",
    name: "Prime Elite",
    subtitle: "For professional NBFCs & firms",
    monthly: 3999,
    yearly: 39990,
    color: "#D97706",
    accent: "#FEF3C7",
    features: [
      "Unlimited clients",
      "Real-time fraud detection",
      "Custom branding on PDFs",
      "Multi-agent collaboration",
      "Dedicated success manager",
      "API access + webhooks",
    ],
  },
];

export default function SubscriptionScreen() {
  const styles = useScreenStyles();
  const router = useRouter();
  const { t } = useI18n();
  const { user } = useAuth();
  const [cycle, setCycle] = useState<"monthly" | "yearly">("monthly");

  const currentTier = (user?.subscription_tier || "starter").toLowerCase();

  const upgrade = (plan: Plan) => {
    Alert.alert(
      `Upgrade to ${plan.name}`,
      `You'll be charged \u20B9${(cycle === "monthly" ? plan.monthly : plan.yearly).toLocaleString("en-IN")} ${cycle}. Payment gateway coming soon.`,
      [{ text: "OK" }],
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} testID="sub-back">
          <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>{t("subscription")}</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: Spacing.lg, paddingBottom: 40 }}>
        <Text style={styles.hero}>Unlock the full power of LendIQ</Text>
        <Text style={styles.heroSub}>Choose the plan that fits your lending business.</Text>

        {/* Cycle toggle */}
        <View style={styles.toggle}>
          {(["monthly", "yearly"] as const).map((c) => (
            <TouchableOpacity
              key={c}
              testID={`cycle-${c}`}
              style={[styles.toggleBtn, cycle === c && styles.toggleBtnActive]}
              onPress={() => setCycle(c)}
            >
              <Text style={[styles.toggleText, cycle === c && styles.toggleTextActive]}>
                {c === "monthly" ? t("monthly") : t("yearly")}
              </Text>
              {c === "yearly" && (
                <View style={styles.saveChip}>
                  <Text style={styles.saveChipText}>Save 17%</Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* Plan cards */}
        {PLANS.map((p) => {
          const active = currentTier === p.key;
          const price = cycle === "monthly" ? p.monthly : p.yearly;
          const cycleLabel = cycle === "monthly" ? t("per_month") : t("per_year");
          return (
            <View
              key={p.key}
              testID={`plan-${p.key}`}
              style={[styles.planCard, { borderColor: active ? p.color : Colors.borderLight }]}
            >
              <View style={[styles.planAccent, { backgroundColor: p.accent }]} />
              <View style={styles.planHeaderRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.planName, { color: p.color }]}>{p.name.toUpperCase()}</Text>
                  <Text style={styles.planSub}>{p.subtitle}</Text>
                </View>
                {p.badge && (
                  <View style={[styles.badgePop, { backgroundColor: p.color }]}>
                    <Text style={styles.badgePopText}>{p.badge}</Text>
                  </View>
                )}
                {active && (
                  <View style={[styles.badgeCur, { borderColor: p.color, backgroundColor: p.accent }]}>
                    <Ionicons name="checkmark-circle" size={14} color={p.color} />
                    <Text style={[styles.badgeCurText, { color: p.color }]}>{t("current_plan")}</Text>
                  </View>
                )}
              </View>

              <View style={styles.priceRow}>
                <Text style={styles.rupee}>₹</Text>
                <Text style={styles.priceNum}>{price.toLocaleString("en-IN")}</Text>
                <Text style={styles.priceCycle}> / {cycleLabel.replace("per ", "")}</Text>
              </View>

              <View style={styles.features}>
                {p.features.map((f, i) => (
                  <View key={i} style={styles.featureRow}>
                    <View style={[styles.featureDot, { backgroundColor: p.color + "22" }]}>
                      <Ionicons name="checkmark" size={12} color={p.color} />
                    </View>
                    <Text style={styles.featureText}>{f}</Text>
                  </View>
                ))}
              </View>

              {!active && (
                <PrimaryButton
                  testID={`upgrade-${p.key}`}
                  title={`${t("upgrade")} → ${p.name}`}
                  onPress={() => upgrade(p)}
                />
              )}
            </View>
          );
        })}

        <Text style={styles.footer}>
          All plans include GST. Cancel anytime. Payment gateway coming soon.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function useScreenStyles() {
  return useThemedStyles(() => StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  topBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  backBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.surface, alignItems: "center", justifyContent: "center", ...Shadows.card },
  title: { flex: 1, textAlign: "center", fontSize: 18, fontWeight: "800", color: Colors.textPrimary },
  hero: { fontSize: 22, fontWeight: "800", color: Colors.textPrimary, letterSpacing: -0.3 },
  heroSub: { color: Colors.textSecondary, marginTop: 4, fontSize: 13 },
  toggle: {
    flexDirection: "row", alignSelf: "center", marginTop: Spacing.lg, marginBottom: Spacing.lg,
    padding: 4, backgroundColor: Colors.bgAlt, borderRadius: 999, borderWidth: 1, borderColor: Colors.borderLight,
  },
  toggleBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 18, paddingVertical: 8, borderRadius: 999 },
  toggleBtnActive: { backgroundColor: Colors.surface, ...Shadows.card },
  toggleText: { fontWeight: "700", color: Colors.textSecondary, fontSize: 13, letterSpacing: 0.3 },
  toggleTextActive: { color: Colors.textPrimary },
  saveChip: { backgroundColor: Colors.success + "22", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999 },
  saveChipText: { color: Colors.success, fontSize: 10, fontWeight: "800" },
  planCard: {
    borderRadius: Radii.xl, borderWidth: 2, backgroundColor: Colors.surface, padding: Spacing.lg,
    marginBottom: Spacing.lg, overflow: "hidden", ...Shadows.card,
  },
  planAccent: { position: "absolute", top: 0, left: 0, right: 0, height: 6 },
  planHeaderRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 },
  planName: { fontSize: 14, fontWeight: "900", letterSpacing: 1 },
  planSub: { color: Colors.textSecondary, fontSize: 12, marginTop: 2 },
  badgePop: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
  badgePopText: { color: "#fff", fontWeight: "800", fontSize: 10, letterSpacing: 0.5 },
  badgeCur: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, borderWidth: 1 },
  badgeCurText: { fontWeight: "800", fontSize: 10, letterSpacing: 0.3 },
  priceRow: { flexDirection: "row", alignItems: "flex-end", marginTop: Spacing.md, gap: 2 },
  rupee: { fontSize: 20, fontWeight: "800", color: Colors.textPrimary, marginBottom: 6 },
  priceNum: { fontSize: 38, fontWeight: "900", color: Colors.textPrimary, letterSpacing: -1 },
  priceCycle: { fontSize: 13, color: Colors.textSecondary, marginBottom: 8, fontWeight: "600" },
  features: { marginTop: Spacing.md, marginBottom: Spacing.md, gap: 10 },
  featureRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  featureDot: { width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  featureText: { color: Colors.textPrimary, fontSize: 13, fontWeight: "600" },
  footer: { textAlign: "center", color: Colors.textMuted, fontSize: 11, marginTop: Spacing.lg, lineHeight: 16 },
  }));
}

