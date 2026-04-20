import React, { useCallback, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../src/api";
import { useAuth } from "../../src/auth";
import { Card } from "../../src/ui";
import { Colors, Radii, Shadows, Spacing, Brand } from "../../src/theme";

type Stats = {
  total_funded: number;
  total_repaid: number;
  expected_returns: number;
  active_loans: number;
  overdue_count: number;
  overdue_amount: number;
  current_month_repaid: number;
  current_month_disbursed: number;
  default_rate: number;
  inflow_chart: { label: string; value: number }[];
  outflow_chart: { label: string; value: number }[];
};

function money(n: number) {
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}k`;
  return `₹${n.toLocaleString()}`;
}

export default function Dashboard() {
  const { user } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { setStats(await api<Stats>("/dashboard")); }
    catch (e) { console.log("dashboard err", e); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const maxIn = Math.max(1, ...(stats?.inflow_chart.map((c) => c.value) || [1]));
  const maxOut = Math.max(1, ...(stats?.outflow_chart.map((c) => c.value) || [1]));

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView
        testID="dashboard-scroll"
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.brandRow}>{Brand.name}</Text>
            <Text style={styles.poweredBy}>{Brand.tagline}</Text>
          </View>
          <TouchableOpacity testID="btn-notifications" onPress={() => router.push("/notifications")} style={styles.bell}>
            <Ionicons name="notifications" size={22} color={Colors.textPrimary} />
          </TouchableOpacity>
        </View>

        <Text style={styles.hello}>Hi, {user?.name?.split(" ")[0] || "Lender"} 👋</Text>

        <View style={styles.heroCard}>
          <Text style={styles.heroLabel}>TOTAL FUNDED</Text>
          <Text testID="stat-total-funded" style={styles.heroAmount}>{stats ? money(stats.total_funded) : "₹0"}</Text>
          <Text style={styles.heroDelta}>Repaid: {stats ? money(stats.total_repaid) : "₹0"} · Returns: {stats ? money(stats.expected_returns) : "₹0"}</Text>
        </View>

        <View style={styles.statRow}>
          <StatBox testID="stat-repaid" icon="trending-up" color={Colors.success}
            label="Repaid this month" value={stats ? money(stats.current_month_repaid) : "₹0"} />
          <StatBox testID="stat-disbursed" icon="arrow-up" color={Colors.primary}
            label="Funded this month" value={stats ? money(stats.current_month_disbursed) : "₹0"} />
        </View>

        <TouchableOpacity
          testID="overdue-card"
          onPress={() => router.push("/overdue")}
          activeOpacity={0.9}
          style={[styles.overdueCard, stats?.overdue_count ? styles.overdueCardHot : null]}
        >
          <View style={[styles.overdueIcon, { backgroundColor: (stats?.overdue_count ? Colors.danger : Colors.success) + "1A" }]}>
            <Ionicons name={stats?.overdue_count ? "warning" : "checkmark-circle"} size={22}
              color={stats?.overdue_count ? Colors.danger : Colors.success} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.overdueLabel}>Overdue payments (current month)</Text>
            <Text style={[styles.overdueValue, { color: stats?.overdue_count ? Colors.danger : Colors.success }]}>
              {stats?.overdue_count ? `${stats.overdue_count} · ${money(stats.overdue_amount)}` : "All on track"}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
        </TouchableOpacity>

        <Card style={{ marginTop: Spacing.md }}>
          <View style={styles.chartHeader}>
            <Ionicons name="arrow-down-circle" size={20} color={Colors.success} />
            <Text style={styles.sectionTitle}>Inflow — last 6 months</Text>
          </View>
          <View style={styles.chart}>
            {(stats?.inflow_chart || []).map((c, i) => {
              const h = Math.max(6, (c.value / maxIn) * 100);
              return (
                <View key={i} style={styles.barCol}>
                  <View style={[styles.bar, { height: h, backgroundColor: c.value > 0 ? Colors.success : Colors.bgAlt }]} />
                  <Text style={styles.barLabel}>{c.label}</Text>
                </View>
              );
            })}
          </View>
        </Card>

        <Card style={{ marginTop: Spacing.md }}>
          <View style={styles.chartHeader}>
            <Ionicons name="arrow-up-circle" size={20} color={Colors.primary} />
            <Text style={styles.sectionTitle}>Outflow — last 6 months</Text>
          </View>
          <View style={styles.chart}>
            {(stats?.outflow_chart || []).map((c, i) => {
              const h = Math.max(6, (c.value / maxOut) * 100);
              return (
                <View key={i} style={styles.barCol}>
                  <View style={[styles.bar, { height: h, backgroundColor: c.value > 0 ? Colors.primary : Colors.bgAlt }]} />
                  <Text style={styles.barLabel}>{c.label}</Text>
                </View>
              );
            })}
          </View>
        </Card>

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
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: Spacing.sm },
  brandRow: { fontSize: 22, fontWeight: "800", color: Colors.primary, letterSpacing: -0.5 },
  poweredBy: { fontSize: 10, color: Colors.textMuted, fontWeight: "700", letterSpacing: 1, marginTop: 1 },
  hello: { fontSize: 18, fontWeight: "700", color: Colors.textPrimary, marginBottom: Spacing.md },
  bell: {
    width: 44, height: 44, borderRadius: Radii.pill, backgroundColor: Colors.surface,
    alignItems: "center", justifyContent: "center", ...Shadows.card,
  },
  heroCard: { backgroundColor: Colors.primary, borderRadius: Radii.xl, padding: Spacing.lg, ...Shadows.button },
  heroLabel: { color: "#D9E7FF", fontSize: 11, fontWeight: "700", letterSpacing: 1 },
  heroAmount: { color: "#fff", fontSize: 34, fontWeight: "800", marginTop: 4, letterSpacing: -0.5 },
  heroDelta: { color: "#D9E7FF", fontSize: 13, marginTop: 6 },
  statRow: { flexDirection: "row", gap: Spacing.md, marginTop: Spacing.md },
  statBox: { flex: 1, backgroundColor: Colors.surface, borderRadius: Radii.lg, padding: Spacing.md, ...Shadows.card },
  statIcon: { width: 36, height: 36, borderRadius: Radii.pill, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  statValue: { fontSize: 20, fontWeight: "800", color: Colors.textPrimary },
  statLabel: { color: Colors.textSecondary, fontSize: 12, marginTop: 2 },
  overdueCard: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: Colors.surface, borderRadius: Radii.lg, padding: Spacing.md,
    marginTop: Spacing.md, ...Shadows.card,
  },
  overdueCardHot: { borderWidth: 2, borderColor: Colors.danger + "55" },
  overdueIcon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  overdueLabel: { color: Colors.textSecondary, fontSize: 12, fontWeight: "700", letterSpacing: 0.5 },
  overdueValue: { fontSize: 18, fontWeight: "800", marginTop: 2 },
  chartHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: Spacing.sm },
  sectionTitle: { fontSize: 15, fontWeight: "800", color: Colors.textPrimary },
  chart: { flexDirection: "row", alignItems: "flex-end", gap: 10, height: 120 },
  barCol: { flex: 1, alignItems: "center", gap: 6 },
  bar: { width: "100%", borderTopLeftRadius: 8, borderTopRightRadius: 8, minHeight: 6 },
  barLabel: { fontSize: 11, color: Colors.textMuted, fontWeight: "600" },
});
