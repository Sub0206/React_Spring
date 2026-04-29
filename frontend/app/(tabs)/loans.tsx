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

// --- Status classification (Global rules) --------------------------------
// OVERDUE    — one or more UNPAID past-due EMIs
// AT RISK    — no pending overdue, but HAS late-paid history (was_late=true)
// ON TRACK   — no issues
// COMPLETED  — all paid
// DEFAULTED  — loan status==="defaulted"
type Health = "on_track" | "overdue" | "at_risk" | "completed" | "defaulted";

function analyze(l: Loan): {
  health: Health;
  overdueCount: number;
  overdueAmount: number;
  lateHistory: number;
} {
  const now = Date.now();
  const schedule = Array.isArray(l.repayment_schedule) ? l.repayment_schedule : [];
  let overdueCount = 0;
  let overdueAmount = 0;
  let lateHistory = 0;
  for (const e of schedule) {
    try {
      const due = new Date(e.due_date).getTime();
      if (e.status !== "paid" && due < now) {
        overdueCount += 1;
        overdueAmount += Number(e.amount) || 0;
      }
      if (e.status === "paid" && e.was_late === true) lateHistory += 1;
    } catch {}
  }
  let health: Health = "on_track";
  if (l.status === "completed") health = "completed";
  else if (l.status === "defaulted") health = "defaulted";
  else if (overdueCount > 0) health = "overdue";
  else if (lateHistory > 0) health = "at_risk";
  return { health, overdueCount, overdueAmount, lateHistory };
}

function healthMeta(h: Health, overdueCount = 0) {
  switch (h) {
    case "completed":
      return { label: "COMPLETED", color: Colors.primary, bg: Colors.primarySoft, icon: "checkmark-circle" as const };
    case "defaulted":
      return { label: "DEFAULTED", color: Colors.danger, bg: Colors.dangerSoft, icon: "close-circle" as const };
    case "overdue":
      return { label: overdueCount > 1 ? "AT RISK · OVERDUE" : "OVERDUE", color: Colors.danger, bg: Colors.dangerSoft, icon: "warning" as const };
    case "at_risk":
      return { label: "AT RISK", color: Colors.danger, bg: Colors.dangerSoft, icon: "alert-circle" as const };
    default:
      return { label: "ON TRACK", color: Colors.success, bg: Colors.successSoft, icon: "trending-up" as const };
  }
}

const FILTERS: { key: "all" | Health; label: string }[] = [
  { key: "all",       label: "All" },
  { key: "on_track",  label: "On Track" },
  { key: "overdue",   label: "Overdue" },
  { key: "at_risk",   label: "At Risk" },
  { key: "completed", label: "Completed" },
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
    return loans.map((l) => ({ loan: l, a: analyze(l) }));
  }, [loans]);

  const filtered = useMemo(() => {
    if (filter === "all") return enriched;
    return enriched.filter((x) => x.a.health === filter);
  }, [enriched, filter]);

  const counts = useMemo(() => {
    const c = { all: enriched.length, on_track: 0, overdue: 0, at_risk: 0, completed: 0 };
    enriched.forEach((x) => { (c as any)[x.a.health] = ((c as any)[x.a.health] || 0) + 1; });
    return c;
  }, [enriched]);

  const totalOverdue = enriched.reduce((s, x) => s + x.a.overdueCount, 0);
  const overdueAmount = enriched.reduce((s, x) => s + x.a.overdueAmount, 0);

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
              f.key === "overdue"  ? Colors.danger :
              f.key === "at_risk"  ? Colors.danger :
              f.key === "completed" ? Colors.primary :
              f.key === "on_track" ? Colors.success :
              Colors.textPrimary;
            return (
              <TouchableOpacity
                key={f.key}
                testID={`filter-${f.key}`}
                onPress={() => setFilter(f.key)}
                activeOpacity={0.85}
                style={[
                  styles.filter,
                  active && { backgroundColor: accent + "15", borderColor: accent },
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
          const { loan, a } = item;
          const m = healthMeta(a.health, a.overdueCount);
          const progress = loan.total_repayment > 0 ? (loan.paid_amount / loan.total_repayment) * 100 : 0;
          const isDanger = a.health === "overdue" || a.health === "at_risk" || a.health === "defaulted";
          const progressFill =
            a.health === "overdue" ? Colors.danger :
            a.health === "at_risk" ? Colors.danger :
            a.health === "completed" ? Colors.primary :
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
              <View style={[styles.accent, { backgroundColor: m.color }]} />

              <View style={styles.cardBody}>
                <View style={styles.rowTop}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.name} numberOfLines={1}>{loan.borrower.name}</Text>
                    <Text style={styles.meta}>
                      Principal ₹{Number(loan.principal || 0).toLocaleString()} · {loan.term_months}mo
                    </Text>
                  </View>
                  <View style={[styles.statusPill, { backgroundColor: m.bg }]}>
                    <Ionicons name={m.icon} size={12} color={m.color} style={{ marginRight: 4 }} />
                    <Text style={[styles.statusText, { color: m.color }]}>{m.label}</Text>
                  </View>
                </View>

                {/* At Risk — late paid history warning */}
                {a.health === "at_risk" && (
                  <View style={styles.riskInline}>
                    <Ionicons name="alert-circle" size={14} color={Colors.danger} />
                    <Text style={styles.riskInlineText}>
                      Currently on track · <Text style={{ fontWeight: "800" }}>{a.lateHistory} late payment{a.lateHistory > 1 ? "s" : ""}</Text> in history
                    </Text>
                  </View>
                )}

                {/* Overdue — current pending */}
                {a.health === "overdue" && (
                  <View style={styles.overdueInline}>
                    <Ionicons name="warning" size={14} color={Colors.danger} />
                    <Text style={styles.overdueInlineText}>
                      <Text style={{ fontWeight: "800" }}>{a.overdueCount}</Text> overdue ·{" "}
                      <Text style={{ fontWeight: "800" }}>₹{a.overdueAmount.toLocaleString()}</Text> pending
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

