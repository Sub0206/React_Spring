import React, { useCallback, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, Image, TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../src/api";
import { useAuth } from "../../src/auth";
import { Card } from "../../src/ui";
import { Colors, Radii, Shadows, Spacing } from "../../src/theme";

type Stats = {
  total_funded: number;
  total_repaid: number;
  expected_returns: number;
  active_loans: number;
  completed_loans: number;
  pending_applications: number;
  approved_applications: number;
  default_rate: number;
  chart_disbursed: { label: string; value: number }[];
};

function money(n: number) {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export default function Dashboard() {
  const { user } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const s = await api<Stats>("/dashboard");
      setStats(s);
    } catch (e) {
      console.log("dashboard err", e);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    load();
  }, [load]));

  const max = Math.max(1, ...(stats?.chart_disbursed.map((c) => c.value) || [1]));

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView
        testID="dashboard-scroll"
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.hello}>Hi, {user?.name?.split(" ")[0] || "Lender"} 👋</Text>
            <Text style={styles.subhead}>Your lending dashboard</Text>
          </View>
          <TouchableOpacity testID="btn-notifications" onPress={() => router.push("/notifications")} style={styles.bell}>
            <Ionicons name="notifications" size={22} color={Colors.textPrimary} />
          </TouchableOpacity>
        </View>

        <View style={styles.heroCard}>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroLabel}>TOTAL FUNDED</Text>
            <Text testID="stat-total-funded" style={styles.heroAmount}>{stats ? money(stats.total_funded) : "$0"}</Text>
            <Text style={styles.heroDelta}>
              Expected returns: {stats ? money(stats.expected_returns) : "$0"}
            </Text>
          </View>
          <Image
            source={{ uri: "https://static.prod-images.emergentagent.com/jobs/b97ea820-9246-4c66-95e8-0a7c3405dd9e/images/2a19192cfda126f4f2e1b658c0a3c5261e60aa82e402dac7c7e030c37a0cf2ac.png" }}
            style={{ width: 90, height: 90 }}
          />
        </View>

        <View style={styles.statRow}>
          <StatBox testID="stat-active" icon="pulse" color={Colors.success} label="Active loans" value={stats?.active_loans ?? 0} />
          <StatBox testID="stat-pending" icon="time" color={Colors.secondary} label="Pending" value={stats?.pending_applications ?? 0} />
        </View>
        <View style={styles.statRow}>
          <StatBox testID="stat-repaid" icon="trending-up" color={Colors.primary} label="Repaid" value={stats ? money(stats.total_repaid) : "$0"} />
          <StatBox testID="stat-default" icon="alert-circle" color={Colors.danger} label="Default rate" value={`${stats?.default_rate?.toFixed(1) ?? 0}%`} />
        </View>

        <Card style={{ marginTop: Spacing.md }}>
          <Text style={styles.sectionTitle}>Disbursed — last 6 months</Text>
          <View style={styles.chart}>
            {(stats?.chart_disbursed || []).map((c, i) => {
              const h = Math.max(6, (c.value / max) * 120);
              return (
                <View key={i} style={styles.barCol}>
                  <View style={[styles.bar, { height: h, backgroundColor: c.value > 0 ? Colors.primary : Colors.bgAlt }]} />
                  <Text style={styles.barLabel}>{c.label}</Text>
                </View>
              );
            })}
          </View>
        </Card>

        <TouchableOpacity
          testID="cta-review-pending"
          onPress={() => router.push("/(tabs)/applications")}
          activeOpacity={0.9}
          style={styles.ctaCard}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.ctaTitle}>{stats?.pending_applications ?? 0} pending requests</Text>
            <Text style={styles.ctaSubtitle}>Review AI-scored loan applications →</Text>
          </View>
          <Ionicons name="arrow-forward-circle" size={40} color={Colors.primary} />
        </TouchableOpacity>

        <View style={{ height: Spacing.xl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function StatBox({ icon, color, label, value, testID }: any) {
  return (
    <View testID={testID} style={styles.statBox}>
      <View style={[styles.statIcon, { backgroundColor: color + "1A" }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  scroll: { padding: Spacing.lg, paddingBottom: Spacing.xxl },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: Spacing.md },
  hello: { fontSize: 24, fontWeight: "800", color: Colors.textPrimary },
  subhead: { color: Colors.textSecondary, marginTop: 2 },
  bell: {
    width: 44, height: 44, borderRadius: Radii.pill, backgroundColor: Colors.surface,
    alignItems: "center", justifyContent: "center", ...Shadows.card,
  },
  heroCard: {
    backgroundColor: Colors.primary, borderRadius: Radii.xl, padding: Spacing.lg,
    flexDirection: "row", alignItems: "center", marginTop: Spacing.sm,
    ...Shadows.button,
  },
  heroLabel: { color: "#D9E7FF", fontSize: 11, fontWeight: "700", letterSpacing: 1 },
  heroAmount: { color: "#fff", fontSize: 34, fontWeight: "800", marginTop: 4, letterSpacing: -0.5 },
  heroDelta: { color: "#D9E7FF", fontSize: 13, marginTop: 6 },
  statRow: { flexDirection: "row", gap: Spacing.md, marginTop: Spacing.md },
  statBox: {
    flex: 1, backgroundColor: Colors.surface, borderRadius: Radii.lg,
    padding: Spacing.md, ...Shadows.card,
  },
  statIcon: { width: 36, height: 36, borderRadius: Radii.pill, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  statValue: { fontSize: 22, fontWeight: "800", color: Colors.textPrimary },
  statLabel: { color: Colors.textSecondary, fontSize: 12, marginTop: 2 },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: Colors.textPrimary, marginBottom: Spacing.md },
  chart: { flexDirection: "row", alignItems: "flex-end", gap: 10, height: 150 },
  barCol: { flex: 1, alignItems: "center", gap: 8 },
  bar: { width: "100%", borderTopLeftRadius: 8, borderTopRightRadius: 8, minHeight: 6 },
  barLabel: { fontSize: 11, color: Colors.textMuted, fontWeight: "600" },
  ctaCard: {
    flexDirection: "row", alignItems: "center", marginTop: Spacing.md,
    backgroundColor: Colors.surface, borderRadius: Radii.xl, padding: Spacing.lg,
    borderWidth: 2, borderColor: Colors.primary + "22",
  },
  ctaTitle: { fontSize: 18, fontWeight: "800", color: Colors.textPrimary },
  ctaSubtitle: { color: Colors.textSecondary, marginTop: 4 },
});
