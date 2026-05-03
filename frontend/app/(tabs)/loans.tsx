import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../src/api";
import { Colors, Radii, Shadows, Spacing } from "../../src/theme";
import { useThemedStyles } from "../../src/themeContext";

type RepayEntry = {
  month: number; due_date: string; amount: number;
  status: string; paid_at?: string | null; was_late?: boolean;
};
type Loan = {
  loan_id: string;
  borrower: { name: string; avatar?: string; occupation?: string };
  principal: number; interest_rate: number; term_months: number;
  monthly_payment: number; total_repayment: number; paid_amount: number;
  status: "active" | "completed" | "defaulted" | string;
  repayment_schedule: RepayEntry[]; funded_at: string;
};

import { classifyLoan, type LoanRiskKind } from "../../src/loanStatus";

// --- Status classification (using centralized helper) --------------------
// Kind values: on_track | overdue_mild (yellow) | overdue_high (red) |
//              completed | defaulted
// See `/app/frontend/src/loanStatus.ts` for business rules.

const FILTERS: { key: "all" | LoanRiskKind; label: string }[] = [
  { key: "all",           label: "All" },
  { key: "on_track",      label: "On Track" },
  { key: "overdue_mild",  label: "Overdue (Mild)" },
  { key: "overdue_high",  label: "At Risk" },
  { key: "completed",     label: "Completed" },
];

export default function Loans() {
  const styles = useScreenStyles();
  const router = useRouter();
  const params = useLocalSearchParams<{ filter?: string }>();
  const [loans, setLoans] = useState<Loan[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<"all" | Health>("all");

  // Accept filter from dashboard deep-link
  useEffect(() => {
    const f = typeof params.filter === "string" ? params.filter : undefined;
    if (f && ["all", "on_track", "overdue", "at_risk", "completed"].includes(f)) {
      setFilter(f as any);
    }
  }, [params.filter]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<Loan[]>("/loans");
      // Defensive: skip malformed/incomplete loans to avoid blank cards
      const valid = (Array.isArray(data) ? data : []).filter(
        (l) => l && l.loan_id && l.borrower && typeof l.borrower.name === "string" && l.borrower.name.trim().length > 0
      );
      setLoans(valid);
    } catch (e) {
      console.log("loans err", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Enrich with analysis
  const enriched = useMemo(() => {
    return loans.map((l) => ({ loan: l, badge: classifyLoan(l) }));
  }, [loans]);

  const filtered = useMemo(() => {
    if (filter === "all") return enriched;
    return enriched.filter((x) => x.badge.kind === filter);
  }, [enriched, filter]);

  const counts = useMemo(() => {
    const c: any = { all: enriched.length, on_track: 0, overdue_mild: 0, overdue_high: 0, completed: 0, defaulted: 0 };
    enriched.forEach((x) => { c[x.badge.kind] = (c[x.badge.kind] || 0) + 1; });
    return c;
  }, [enriched]);

  const totalOverdue = enriched.reduce((s, x) => s + x.badge.overdueCount, 0);
  const overdueAmount = enriched.reduce((s, x) => s + x.badge.overdueAmount, 0);

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

      {/* Filter pills */}
      <View style={styles.filtersWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: Spacing.lg, gap: 8 }}
        >
          {FILTERS.map((f) => {
            const active = filter === f.key;
            const n = (counts as any)[f.key] ?? 0;
            const accent =
              f.key === "overdue_mild" ? Colors.riskMild :
              f.key === "overdue_high" ? Colors.riskHigh :
              f.key === "completed"    ? Colors.primary :
              f.key === "on_track"     ? Colors.success :
              Colors.textPrimary;
            return (
              <TouchableOpacity
                key={f.key}
                testID={`filter-${f.key}`}
                onPress={() => setFilter(f.key)}
                activeOpacity={0.85}
                style={[
                  styles.filter,
                  active && { backgroundColor: accent + "22", borderColor: accent },
                ]}
              >
                <Text style={[styles.filterText, active && { color: accent }]}>{f.label}</Text>
                <View style={[styles.filterBadge, active && { backgroundColor: accent }]}>
                  <Text style={[styles.filterBadgeText, active && { color: "#fff" }]}>{n}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <FlatList
        testID="loans-list"
        data={filtered}
        keyExtractor={(i) => i.loan.loan_id}
        contentContainerStyle={{ padding: Spacing.lg, paddingTop: Spacing.sm, paddingBottom: Spacing.xxl }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={Colors.primary} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Ionicons name="wallet-outline" size={44} color={Colors.primary} />
            </View>
            <Text style={styles.emptyTitle}>
              {filter === "all" ? "No loans yet" : `No ${FILTERS.find(f => f.key === filter)?.label.toLowerCase()} loans`}
            </Text>
            <Text style={styles.emptyText}>
              {filter === "all"
                ? "Fund your first approved application to see it here."
                : "Try a different filter."}
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const { loan, badge } = item;
          const progress = loan.total_repayment > 0 ? (loan.paid_amount / loan.total_repayment) * 100 : 0;
          const isDanger = badge.kind === "overdue_high" || badge.kind === "defaulted";
          const progressFill =
            badge.kind === "overdue_high" ? Colors.riskHigh :
            badge.kind === "overdue_mild" ? Colors.riskMild :
            badge.kind === "completed"    ? Colors.primary :
            badge.kind === "defaulted"    ? Colors.riskHigh :
            Colors.success;

          return (
            <TouchableOpacity
              testID={`loan-item-${loan.loan_id}`}
              activeOpacity={0.9}
              onPress={() => router.push({ pathname: "/loan/[id]", params: { id: loan.loan_id } })}
              style={[
                styles.card,
                isDanger && styles.cardDanger,
              ]}
            >
              <View style={[styles.accent, { backgroundColor: badge.color }]} />

              <View style={styles.cardBody}>
                <View style={styles.rowTop}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.name} numberOfLines={1}>{loan.borrower.name}</Text>
                    <Text style={styles.meta}>
                      Principal ₹{Number(loan.principal || 0).toLocaleString()} · {loan.term_months}mo
                    </Text>
                  </View>
                  <View style={[styles.statusPill, { backgroundColor: badge.bg, borderColor: badge.border, borderWidth: 1 }]}>
                    <Ionicons name={badge.icon} size={12} color={badge.color} style={{ marginRight: 4 }} />
                    <Text style={[styles.statusText, { color: badge.color }]}>{badge.label}</Text>
                  </View>
                </View>

                {/* Overdue — current pending (any level) */}
                {(badge.kind === "overdue_mild" || badge.kind === "overdue_high") && (
                  <View style={[styles.overdueInline, { backgroundColor: badge.bg, borderColor: badge.border }]}>
                    <Ionicons name={badge.icon} size={14} color={badge.color} />
                    <Text style={[styles.overdueInlineText, { color: badge.color }]}>
                      <Text style={{ fontWeight: "800" }}>{badge.overdueCount}</Text> overdue ·{" "}
                      <Text style={{ fontWeight: "800" }}>₹{badge.overdueAmount.toLocaleString()}</Text> pending
                      {badge.kind === "overdue_high" ? " · needs attention" : ""}
                    </Text>
                  </View>
                )}

                <View style={styles.amountRow}>
                  <View style={styles.amountCell}>
                    <Text style={styles.label}>MONTHLY</Text>
                    <Text style={styles.value}>₹{Number(loan.monthly_payment || 0).toLocaleString()}</Text>
                  </View>
                  <View style={styles.divider} />
                  <View style={styles.amountCell}>
                    <Text style={styles.label}>PAID</Text>
                    <Text style={[styles.value, { color: Colors.success }]}>
                      ₹{Number(loan.paid_amount || 0).toLocaleString()}
                    </Text>
                  </View>
                  <View style={styles.divider} />
                  <View style={styles.amountCell}>
                    <Text style={styles.label}>BALANCE</Text>
                    <Text style={styles.value}>
                      ₹{Math.max(0, Number(loan.total_repayment || 0) - Number(loan.paid_amount || 0)).toLocaleString()}
                    </Text>
                  </View>
                </View>

                <View style={styles.progressBar}>
                  <View
                    style={[
                      styles.progressFill,
                      { width: `${Math.min(100, Math.max(0, progress))}%`, backgroundColor: progressFill },
                    ]}
                  />
                </View>
                <View style={styles.progressMeta}>
                  <Text style={styles.progressText}>{progress.toFixed(1)}% repaid</Text>
                  <Text style={styles.progressText}>Total ₹{Number(loan.total_repayment || 0).toLocaleString()}</Text>
                </View>
              </View>
            </TouchableOpacity>
          );
        }}
      />
    </SafeAreaView>
  );
}

function useScreenStyles() {
  return useThemedStyles(() => StyleSheet.create({
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

  filtersWrap: { paddingVertical: 8 },
  filter: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radii.pill,
    backgroundColor: Colors.surface, borderWidth: 1.5, borderColor: Colors.border,
  },
  filterText: { color: Colors.textSecondary, fontWeight: "800", fontSize: 13 },
  filterBadge: {
    minWidth: 20, paddingHorizontal: 6, paddingVertical: 1,
    borderRadius: 10, backgroundColor: Colors.bgAlt, alignItems: "center", justifyContent: "center",
  },
  filterBadgeText: { color: Colors.textSecondary, fontSize: 11, fontWeight: "800" },

  card: {
    flexDirection: "row",
    backgroundColor: Colors.surface, borderRadius: Radii.xl,
    marginBottom: 12, overflow: "hidden", ...Shadows.card,
  },
  cardDanger: {
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
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radii.pill,
  },
  statusText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.6 },

  overdueInline: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: Colors.dangerSoft, padding: 8, borderRadius: Radii.md, marginTop: 10,
  },
  overdueInlineText: { color: Colors.dangerDark, fontSize: 12, flex: 1 },
  riskInline: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: Colors.dangerSoft, padding: 8, borderRadius: Radii.md, marginTop: 10,
    borderLeftWidth: 3, borderLeftColor: Colors.danger,
  },
  riskInlineText: { color: Colors.dangerDark, fontSize: 12, flex: 1 },

  amountRow: {
    flexDirection: "row", marginTop: 12,
    backgroundColor: Colors.bgAlt, borderRadius: Radii.md, padding: 10,
  },
  amountCell: { flex: 1, alignItems: "center" },
  divider: { width: 1, backgroundColor: Colors.border, alignSelf: "stretch" },
  label: { fontSize: 9, fontWeight: "800", color: Colors.textMuted, letterSpacing: 0.5 },
  value: { fontSize: 13, fontWeight: "800", color: Colors.textPrimary, marginTop: 4, letterSpacing: -0.2 },

  progressBar: {
    height: 8, backgroundColor: Colors.bgAlt, borderRadius: 4, marginTop: 12, overflow: "hidden",
  },
  progressFill: { height: "100%", borderRadius: 4 },
  progressMeta: { flexDirection: "row", justifyContent: "space-between", marginTop: 6 },
  progressText: { color: Colors.textSecondary, fontSize: 11, fontWeight: "600" },

  empty: { alignItems: "center", marginTop: Spacing.xxl, padding: Spacing.lg },
  emptyIcon: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: Colors.primarySoft,
    alignItems: "center", justifyContent: "center", marginBottom: Spacing.md,
  },
  emptyTitle: { fontSize: 18, fontWeight: "800", color: Colors.textPrimary, marginTop: Spacing.md },
  emptyText: { color: Colors.textSecondary, marginTop: 6, textAlign: "center", fontSize: 13 },
  }));
}

