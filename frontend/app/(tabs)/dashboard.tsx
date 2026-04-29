import React, { useCallback, useMemo, useState } from "react";
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
import { useThemedStyles } from "../../src/themeContext";
import { NotificationBell } from "../../src/notificationBell";

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
  portfolio_health?: { on_track: number; overdue: number; at_risk: number; completed: number; defaulted: number };
  inflow_chart: { label: string; value: number }[];
  outflow_chart: { label: string; value: number }[];
};

type Txn = {
  transaction_id: string;
  amount: number;
  type: string;
  description: string;
  created_at: string;
};

function money(n: number) {
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}k`;
  return `₹${n.toLocaleString()}`;
}

export default function Dashboard() {
  const styles = useScreenStyles();
  const { user } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [txns, setTxns] = useState<Txn[]>([]);
  const [txnTab, setTxnTab] = useState<"all" | "credit" | "debit" | "high">("all");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, t] = await Promise.all([
        api<Stats>("/dashboard"),
        api<Txn[]>("/transactions"),
      ]);
      setStats(s);
      setTxns(t || []);
    } catch (e) { console.log("dashboard err", e); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const filteredTxns = useMemo(() => {
    let list = [...txns];
    if (txnTab === "credit") list = list.filter((t) => t.amount >= 0);
    else if (txnTab === "debit") list = list.filter((t) => t.amount < 0);
    else if (txnTab === "high") list = list.filter((t) => Math.abs(t.amount) >= 50000);
    return list.slice(0, 10);
  }, [txns, txnTab]);

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
          <NotificationBell />
        </View>

        <Text style={styles.hello}>Hi, {user?.name?.split(" ")[0] || "Lender"} 👋</Text>

        <View style={styles.heroCard}>
          <Text style={styles.heroLabel}>TOTAL FUNDED</Text>
          <Text testID="stat-total-funded" style={styles.heroAmount}>{stats ? money(stats.total_funded) : "₹0"}</Text>
          <Text style={styles.heroDelta}>Repaid: {stats ? money(stats.total_repaid) : "₹0"} · Returns: {stats ? money(stats.expected_returns) : "₹0"}</Text>
        </View>

        {/* Portfolio Health breakdown */}
        {stats?.portfolio_health && (
          <View style={styles.healthCard}>
            <View style={styles.healthHead}>
              <Ionicons name="pulse" size={18} color={Colors.primary} />
              <Text style={styles.healthTitle}>Portfolio health</Text>
            </View>
            <View style={styles.healthRow}>
              <HealthTile
                onPress={() => router.push({ pathname: "/(tabs)/loans", params: { filter: "on_track" } } as any)}
                label="On Track"
                count={stats.portfolio_health.on_track}
                color={Colors.success}
                icon="trending-up"
              />
              <HealthTile
                onPress={() => router.push({ pathname: "/(tabs)/loans", params: { filter: "overdue" } } as any)}
                label="Overdue"
                count={stats.portfolio_health.overdue}
                color={Colors.danger}
                icon="warning"
              />
              <HealthTile
                onPress={() => router.push({ pathname: "/(tabs)/loans", params: { filter: "at_risk" } } as any)}
                label="At Risk"
                count={stats.portfolio_health.at_risk}
                color={Colors.danger}
                icon="alert-circle"
              />
              <HealthTile
                onPress={() => router.push({ pathname: "/(tabs)/loans", params: { filter: "completed" } } as any)}
                label="Completed"
                count={stats.portfolio_health.completed}
                color={Colors.primary}
                icon="checkmark-circle"
              />
            </View>
          </View>
        )}

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

        {/* Recent Transactions */}
        <Card style={{ marginTop: Spacing.md }}>
          <View style={styles.chartHeader}>
            <Ionicons name="receipt" size={18} color={Colors.primary} />
            <Text style={styles.chartTitle}>Recent transactions</Text>
          </View>
          <View style={styles.txnTabs}>
            {([
              { k: "all", label: "All" },
              { k: "credit", label: "Credits" },
              { k: "debit", label: "Debits" },
              { k: "high", label: "High Value" },
            ] as const).map((t) => (
              <TouchableOpacity
                key={t.k}
                testID={`txn-tab-${t.k}`}
                style={[styles.txnTab, txnTab === t.k && styles.txnTabActive]}
                onPress={() => setTxnTab(t.k)}
              >
                <Text style={[styles.txnTabText, txnTab === t.k && styles.txnTabTextActive]}>{t.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {filteredTxns.length === 0 ? (
            <Text style={styles.txnEmpty}>No transactions yet.</Text>
          ) : (
            filteredTxns.map((t) => {
              const credit = t.amount >= 0;
              const iconBg = credit ? Colors.success + "1A" : Colors.danger + "1A";
              const iconColor = credit ? Colors.success : Colors.danger;
              return (
                <View key={t.transaction_id} style={styles.txnRow}>
                  <View style={[styles.txnIcon, { backgroundColor: iconBg }]}>
                    <Ionicons name={credit ? "arrow-down" : "arrow-up"} size={16} color={iconColor} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.txnTitle} numberOfLines={1}>{t.description}</Text>
                    <Text style={styles.txnDate}>{new Date(t.created_at).toLocaleDateString()}</Text>
                  </View>
                  <Text style={[styles.txnAmt, { color: iconColor }]}>
                    {credit ? "+" : "-"}{money(Math.abs(t.amount))}
                  </Text>
                </View>
              );
            })
          )}
        </Card>

        <View style={{ height: Spacing.xl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function StatBox({ icon, color, label, value, testID }: any) {
  const styles = useScreenStyles();
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

function HealthTile({ label, count, color, icon, onPress }: { label: string; count: number; color: string; icon: any; onPress?: () => void }) {
  const styles = useScreenStyles();
  return (
    <TouchableOpacity
      testID={`health-${label.replace(/\s+/g, "-").toLowerCase()}`}
      onPress={onPress}
      activeOpacity={0.85}
      style={[styles.healthTile, { borderColor: color + "33" }]}
    >
      <View style={[styles.healthIcon, { backgroundColor: color + "1A" }]}>
        <Ionicons name={icon} size={16} color={color} />
      </View>
      <Text style={[styles.healthCount, { color }]}>{count}</Text>
      <Text style={styles.healthLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

function useScreenStyles() {
  return useThemedStyles(() => StyleSheet.create({
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
  chartHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: Spacing.sm },
  chartTitle: { fontSize: 15, fontWeight: "800", color: Colors.textPrimary, flex: 1 },
  sectionTitle: { fontSize: 15, fontWeight: "800", color: Colors.textPrimary },
  chart: { flexDirection: "row", alignItems: "flex-end", gap: 10, height: 120 },
  barCol: { flex: 1, alignItems: "center", gap: 6 },
  bar: { width: "100%", borderTopLeftRadius: 8, borderTopRightRadius: 8, minHeight: 6 },
  barLabel: { fontSize: 11, color: Colors.textMuted, fontWeight: "600" },

  txnTabs: { flexDirection: "row", gap: 6, marginBottom: 10 },
  txnTab: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: Colors.bgAlt, borderWidth: 1, borderColor: Colors.borderLight },
  txnTabActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  txnTabText: { fontSize: 11, fontWeight: "700", color: Colors.textSecondary, letterSpacing: 0.3 },
  txnTabTextActive: { color: "#fff" },
  txnEmpty: { color: Colors.textMuted, textAlign: "center", paddingVertical: 20, fontSize: 13 },
  txnRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  txnIcon: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  txnTitle: { fontSize: 13, fontWeight: "700", color: Colors.textPrimary },
  txnDate: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  txnAmt: { fontSize: 13, fontWeight: "800" },

  healthCard: {
    backgroundColor: Colors.surface, borderRadius: Radii.lg,
    padding: Spacing.md, marginTop: Spacing.md, ...Shadows.card,
  },
  healthHead: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  healthTitle: { fontSize: 15, fontWeight: "800", color: Colors.textPrimary },
  healthRow: { flexDirection: "row", gap: 8 },
  healthTile: {
    flex: 1, paddingVertical: 12, paddingHorizontal: 8,
    borderRadius: Radii.md, borderWidth: 1.5, alignItems: "center",
    backgroundColor: Colors.bg,
  },
  healthIcon: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: "center", justifyContent: "center", marginBottom: 6,
  },
  healthCount: { fontSize: 22, fontWeight: "800", letterSpacing: -0.5 },
  healthLabel: { fontSize: 10, color: Colors.textSecondary, fontWeight: "700", marginTop: 2, letterSpacing: 0.3, textAlign: "center" },
  }));
}

