import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../src/api";
import { Colors, Radii, Shadows, Spacing } from "../../src/theme";

type RepayEntry = { month: number; due_date: string; amount: number; status: string; paid_at?: string | null; was_late?: boolean };
type Loan = {
  loan_id: string;
  borrower: { name: string; avatar?: string; occupation?: string };
  principal: number;
  interest_rate: number;
  term_months: number;
  monthly_payment: number;
  total_repayment: number;
  paid_amount: number;
  status: "active" | "completed" | "defaulted";
  repayment_schedule: RepayEntry[];
  funded_at: string;
};

// Compute overdue stats from repayment_schedule
function overdueOf(l: Loan) {
  const now = Date.now();
  const entries = (l.repayment_schedule || []).filter(
    (e) => e.status !== "paid" && new Date(e.due_date).getTime() < now
  );
  const amount = entries.reduce((s, e) => s + (e.amount || 0), 0);
  return { count: entries.length, amount, entries };
}

export default function Loans() {
  const router = useRouter();
  const [loans, setLoans] = useState<Loan[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setLoans(await api<Loan[]>("/loans"));
    } catch (e) {
      console.log("loans err", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Aggregate overdue summary for banner
  const totalOverdue = loans.reduce((s, l) => s + overdueOf(l).count, 0);
  const overdueAmount = loans.reduce((s, l) => s + overdueOf(l).amount, 0);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Active Loans</Text>
          <Text style={styles.subtitle}>Track repayments and loan performance</Text>
        </View>
        <View style={styles.headerIcon}>
          <Ionicons name="wallet" size={22} color={Colors.primary} />
        </View>
      </View>

      {/* Overdue summary banner → tap to go to dedicated overdue screen */}
      {totalOverdue > 0 && (
        <TouchableOpacity
          testID="overdue-banner"
          activeOpacity={0.9}
          onPress={() => router.push("/overdue")}
          style={styles.overdueBanner}
        >
          <View style={styles.overdueIcon}>
            <Ionicons name="warning" size={22} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.overdueTitle}>
              {totalOverdue} overdue payment{totalOverdue > 1 ? "s" : ""}
            </Text>
            <Text style={styles.overdueSub}>
              ₹{overdueAmount.toLocaleString()} pending · Tap to view
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#fff" />
        </TouchableOpacity>
      )}

      <FlatList
        testID="loans-list"
        data={loans}
        keyExtractor={(i) => i.loan_id}
        contentContainerStyle={{ padding: Spacing.lg, paddingTop: Spacing.md, paddingBottom: Spacing.xxl }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={Colors.primary} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Ionicons name="wallet-outline" size={48} color={Colors.primary} />
            </View>
            <Text style={styles.emptyTitle}>No loans yet</Text>
            <Text style={styles.emptyText}>Fund your first approved application to see it here.</Text>
          </View>
        }
        renderItem={({ item }) => {
          const o = overdueOf(item);
          const hasOverdue = o.count > 0 && item.status === "active";
          const progress = item.total_repayment > 0 ? (item.paid_amount / item.total_repayment) * 100 : 0;
          const statusColor =
            item.status === "completed" ? Colors.primary :
            item.status === "defaulted" ? Colors.danger :
            hasOverdue ? Colors.danger : Colors.success;
          const statusLabel =
            item.status === "completed" ? "COMPLETED" :
            item.status === "defaulted" ? "DEFAULTED" :
            hasOverdue ? "OVERDUE" : "ON TRACK";

          return (
            <TouchableOpacity
              testID={`loan-item-${item.loan_id}`}
              activeOpacity={0.9}
              onPress={() => router.push({ pathname: "/loan/[id]", params: { id: item.loan_id } })}
              style={[
                styles.card,
                hasOverdue && styles.cardOverdue,
              ]}
            >
              {/* Colored accent bar */}
              <View style={[styles.accent, { backgroundColor: statusColor }]} />

              <View style={styles.cardBody}>
                <View style={styles.rowTop}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.name} numberOfLines={1}>{item.borrower.name}</Text>
                    <Text style={styles.meta}>
                      Principal ₹{item.principal.toLocaleString()} · {item.term_months}mo
                    </Text>
                  </View>
                  <View style={[styles.statusPill, { backgroundColor: statusColor + "1A" }]}>
                    {hasOverdue && <Ionicons name="warning" size={11} color={statusColor} style={{ marginRight: 3 }} />}
                    <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
                  </View>
                </View>

                {hasOverdue && (
                  <View style={styles.overdueInline}>
                    <Ionicons name="alert-circle" size={14} color={Colors.danger} />
                    <Text style={styles.overdueInlineText}>
                      <Text style={{ fontWeight: "800" }}>{o.count}</Text> overdue ·{" "}
                      <Text style={{ fontWeight: "800" }}>₹{o.amount.toLocaleString()}</Text> pending
                    </Text>
                  </View>
                )}

                <View style={styles.amountRow}>
                  <View style={styles.amountCell}>
                    <Text style={styles.label}>MONTHLY</Text>
                    <Text style={styles.value}>₹{item.monthly_payment.toLocaleString()}</Text>
                  </View>
                  <View style={styles.divider} />
                  <View style={styles.amountCell}>
                    <Text style={styles.label}>PAID</Text>
                    <Text style={[styles.value, { color: Colors.success }]}>
                      ₹{item.paid_amount.toLocaleString()}
                    </Text>
                  </View>
                  <View style={styles.divider} />
                  <View style={styles.amountCell}>
                    <Text style={styles.label}>BALANCE</Text>
                    <Text style={styles.value}>
                      ₹{Math.max(0, item.total_repayment - item.paid_amount).toLocaleString()}
                    </Text>
                  </View>
                </View>

                <View style={styles.progressBar}>
                  <View
                    style={[
                      styles.progressFill,
                      {
                        width: `${Math.min(100, progress)}%`,
                        backgroundColor: hasOverdue ? Colors.danger : Colors.success,
                      },
                    ]}
                  />
                </View>
                <View style={styles.progressMeta}>
                  <Text style={styles.progressText}>{progress.toFixed(1)}% repaid</Text>
                  <Text style={styles.progressText}>Total ₹{item.total_repayment.toLocaleString()}</Text>
                </View>
              </View>
            </TouchableOpacity>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },

  header: {
    paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm, paddingBottom: Spacing.md,
    flexDirection: "row", alignItems: "center", gap: Spacing.sm,
  },
  title: { fontSize: 28, fontWeight: "800", color: Colors.textPrimary, letterSpacing: -0.5 },
  subtitle: { color: Colors.textSecondary, marginTop: 2, fontSize: 13 },
  headerIcon: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: Colors.primarySoft, alignItems: "center", justifyContent: "center",
  },

  overdueBanner: {
    flexDirection: "row", alignItems: "center", gap: 12,
    marginHorizontal: Spacing.lg, marginBottom: Spacing.sm,
    padding: 14, borderRadius: Radii.lg,
    backgroundColor: Colors.danger, ...Shadows.danger,
  },
  overdueIcon: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.22)",
    alignItems: "center", justifyContent: "center",
  },
  overdueTitle: { color: "#fff", fontSize: 15, fontWeight: "800" },
  overdueSub: { color: "#ffffffd8", fontSize: 12, marginTop: 2, fontWeight: "600" },

  card: {
    flexDirection: "row",
    backgroundColor: Colors.surface, borderRadius: Radii.xl,
    marginBottom: 12, overflow: "hidden", ...Shadows.card,
  },
  cardOverdue: {
    borderWidth: 1.5, borderColor: Colors.danger + "55",
    backgroundColor: "#FFF8F8",
    ...Shadows.danger,
  },
  accent: { width: 4 },
  cardBody: { flex: 1, padding: Spacing.md },

  rowTop: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  name: { fontSize: 16, fontWeight: "800", color: Colors.textPrimary },
  meta: { color: Colors.textSecondary, fontSize: 12, marginTop: 2 },

  statusPill: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 9, paddingVertical: 4, borderRadius: Radii.pill,
  },
  statusText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.6 },

  overdueInline: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: Colors.dangerSoft, padding: 8, borderRadius: Radii.md,
    marginTop: 10,
  },
  overdueInlineText: { color: Colors.dangerDark, fontSize: 12, flex: 1 },

  amountRow: {
    flexDirection: "row", marginTop: 12,
    backgroundColor: Colors.bgAlt, borderRadius: Radii.md, padding: 10,
  },
  amountCell: { flex: 1, alignItems: "center" },
  divider: { width: 1, backgroundColor: Colors.border, alignSelf: "stretch" },
  label: { fontSize: 9, fontWeight: "800", color: Colors.textMuted, letterSpacing: 0.5 },
  value: { fontSize: 13, fontWeight: "800", color: Colors.textPrimary, marginTop: 4, letterSpacing: -0.2 },

  progressBar: {
    height: 8, backgroundColor: Colors.bgAlt, borderRadius: 4,
    marginTop: 12, overflow: "hidden",
  },
  progressFill: { height: "100%", borderRadius: 4 },
  progressMeta: {
    flexDirection: "row", justifyContent: "space-between",
    marginTop: 6,
  },
  progressText: { color: Colors.textSecondary, fontSize: 11, fontWeight: "600" },

  empty: { alignItems: "center", marginTop: Spacing.xxl, padding: Spacing.lg },
  emptyIcon: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: Colors.primarySoft,
    alignItems: "center", justifyContent: "center", marginBottom: Spacing.md,
  },
  emptyTitle: { fontSize: 18, fontWeight: "800", color: Colors.textPrimary, marginTop: Spacing.md },
  emptyText: { color: Colors.textSecondary, marginTop: 6, textAlign: "center", fontSize: 13 },
});
