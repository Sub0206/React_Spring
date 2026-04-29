import React, { useCallback, useState } from "react";
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../src/api";
import { Colors, Radii, Shadows, Spacing } from "../../src/theme";
import { useThemedStyles } from "../../src/themeContext";

type App = {
  application_id: string;
  borrower: { name: string; avatar?: string; occupation?: string };
  amount: number;
  purpose: string;
  term_months: number;
  interest_rate: number;
  status: string;
  ai_score?: number | null;
  ai_risk?: string | null;
  created_at: string;
};

// Unified filters — "Approved" and "Funded" merged into single FUNDED status in this lender app.
const FILTERS = [
  { key: "pending",  label: "Pending",  icon: "time-outline" as const,          color: Colors.warning },
  { key: "funded",   label: "Funded",   icon: "checkmark-done-circle" as const, color: Colors.success },
  { key: "rejected", label: "Rejected", icon: "close-circle" as const,          color: Colors.danger  },
];

function riskMeta(risk?: string | null) {
  if (risk === "low")     return { color: Colors.success, label: "LOW",  bg: Colors.successSoft };
  if (risk === "medium")  return { color: Colors.warning, label: "MED",  bg: Colors.warningSoft };
  if (risk === "high")    return { color: Colors.danger,  label: "HIGH", bg: Colors.dangerSoft  };
  return { color: Colors.textMuted, label: "—", bg: Colors.bgAlt };
}

function statusMeta(status: string) {
  if (status === "pending")  return { label: "AWAITING REVIEW", color: Colors.warning, bg: Colors.warningSoft };
  if (status === "approved") return { label: "READY TO FUND",   color: Colors.accent,  bg: Colors.accentSoft };
  if (status === "funded")   return { label: "FUNDED",          color: Colors.success, bg: Colors.successSoft };
  if (status === "rejected") return { label: "REJECTED",        color: Colors.danger,  bg: Colors.dangerSoft };
  return { label: status.toUpperCase(), color: Colors.textMuted, bg: Colors.bgAlt };
}

function initialsOf(name?: string) {
  return (name || "?")
    .trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase()).filter(Boolean).join("") || "?";
}

export default function Applications() {
  const styles = useScreenStyles();
  const router = useRouter();
  const [filter, setFilter] = useState("pending");
  const [items, setItems] = useState<App[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (filter === "pending") {
        // Pending filter shows BOTH status=pending (awaiting review)
        // AND status=approved (Ready to Fund) so Fund-Later requests are visible.
        const [p, a] = await Promise.all([
          api<App[]>(`/applications?status=pending`).catch(() => []),
          api<App[]>(`/applications?status=approved`).catch(() => []),
        ]);
        const map = new Map<string, App>();
        [...p, ...a].forEach(x => map.set(x.application_id, x));
        setItems(Array.from(map.values()).sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        ));
      } else if (filter === "funded") {
        const data = await api<App[]>(`/applications?status=funded`);
        setItems(data);
      } else {
        const data = await api<App[]>(`/applications?status=${filter}`);
        setItems(data);
      }
    } catch (e) {
      console.log("apps err", e);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Loan Requests</Text>
          <Text style={styles.subtitle}>AI-scored applications ready for review</Text>
        </View>
        <View style={styles.headerIcon}>
          <Ionicons name="sparkles" size={22} color={Colors.gold} />
        </View>
      </View>

      <View style={styles.filters}>
        {FILTERS.map((f) => {
          const active = filter === f.key;
          return (
            <TouchableOpacity
              key={f.key}
              testID={`filter-${f.key}`}
              onPress={() => setFilter(f.key)}
              activeOpacity={0.85}
              style={[styles.filter, active && { borderColor: f.color, backgroundColor: f.color + "10" }]}
            >
              <Ionicons name={f.icon} size={14} color={active ? f.color : Colors.textSecondary} />
              <Text style={[styles.filterText, active && { color: f.color }]}>{f.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <FlatList
        testID="applications-list"
        data={items}
        keyExtractor={(i) => i.application_id}
        contentContainerStyle={{ padding: Spacing.lg, paddingTop: Spacing.sm, paddingBottom: Spacing.xxl }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={Colors.primary} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Ionicons name="documents-outline" size={44} color={Colors.primary} />
            </View>
            <Text style={styles.emptyTitle}>No {filter} requests</Text>
            <Text style={styles.emptyText}>
              {filter === "pending"
                ? "New requests will appear here as clients apply."
                : "Pull to refresh or check back later."}
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const s = statusMeta(item.status);
          const r = riskMeta(item.ai_risk);
          return (
            <TouchableOpacity
              testID={`app-item-${item.application_id}`}
              onPress={() => router.push({ pathname: "/application/[id]", params: { id: item.application_id } })}
              activeOpacity={0.9}
              style={styles.card}
            >
              {/* Left accent bar colored by status */}
              <View style={[styles.accent, { backgroundColor: s.color }]} />

              <View style={styles.cardBody}>
                {/* Row 1: initials + name + amount */}
                <View style={styles.rowTop}>
                  <View style={styles.initials}>
                    <Text style={styles.initialsText}>{initialsOf(item.borrower?.name)}</Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.name} numberOfLines={1}>{item.borrower?.name || "Client"}</Text>
                    <Text style={styles.meta} numberOfLines={1}>
                      {item.purpose || "Personal"} · {item.term_months}mo · {item.interest_rate}% APR
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={styles.amount}>₹{item.amount.toLocaleString()}</Text>
                    <View style={[styles.statusPill, { backgroundColor: s.bg }]}>
                      <Text style={[styles.statusPillText, { color: s.color }]}>{s.label}</Text>
                    </View>
                  </View>
                </View>

                {/* Row 2: AI metrics */}
                <View style={styles.rowBottom}>
                  {item.ai_score != null ? (
                    <View style={[styles.chip, { backgroundColor: Colors.primarySoft }]}>
                      <Ionicons name="analytics" size={12} color={Colors.primary} />
                      <Text style={[styles.chipText, { color: Colors.primary }]}>
                        AI {item.ai_score}
                      </Text>
                    </View>
                  ) : (
                    <View style={[styles.chip, { backgroundColor: Colors.bgAlt }]}>
                      <Ionicons name="sparkles" size={12} color={Colors.textMuted} />
                      <Text style={[styles.chipText, { color: Colors.textMuted }]}>Tap to score</Text>
                    </View>
                  )}
                  {item.ai_risk && (
                    <View style={[styles.chip, { backgroundColor: r.bg }]}>
                      <View style={[styles.dot, { backgroundColor: r.color }]} />
                      <Text style={[styles.chipText, { color: r.color }]}>{r.label} risk</Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }} />
                  <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
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
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
  },
  title: { fontSize: 28, fontWeight: "800", color: Colors.textPrimary, letterSpacing: -0.5 },
  subtitle: { color: Colors.textSecondary, marginTop: 2, fontSize: 13 },
  headerIcon: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: Colors.goldSoft, alignItems: "center", justifyContent: "center",
    ...Shadows.gold,
  },
  filters: {
    flexDirection: "row", gap: 8,
    paddingHorizontal: Spacing.lg, marginBottom: Spacing.sm, flexWrap: "wrap",
  },
  filter: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: Radii.pill,
    backgroundColor: Colors.surface, borderWidth: 1.5, borderColor: Colors.border,
  },
  filterText: { color: Colors.textSecondary, fontWeight: "700", fontSize: 13 },
  card: {
    flexDirection: "row",
    backgroundColor: Colors.surface, borderRadius: Radii.xl,
    marginBottom: 12, ...Shadows.card, overflow: "hidden",
  },
  accent: { width: 4 },
  cardBody: { flex: 1, padding: Spacing.md },
  rowTop: { flexDirection: "row", alignItems: "center", gap: Spacing.md },
  initials: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: Colors.primarySoft,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1.5, borderColor: Colors.primary + "33",
  },
  initialsText: { fontSize: 16, fontWeight: "800", color: Colors.primary },
  name: { fontSize: 16, fontWeight: "800", color: Colors.textPrimary },
  meta: { color: Colors.textSecondary, fontSize: 12, marginTop: 2 },
  amount: { fontSize: 16, fontWeight: "800", color: Colors.textPrimary, letterSpacing: -0.3 },
  statusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radii.pill, marginTop: 4 },
  statusPillText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.6 },
  rowBottom: {
    flexDirection: "row", alignItems: "center", gap: 6,
    marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.borderLight,
  },
  chip: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: Radii.pill,
  },
  chipText: { fontSize: 11, fontWeight: "800", letterSpacing: 0.3 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  empty: { alignItems: "center", marginTop: Spacing.xxl, padding: Spacing.lg },
  emptyIcon: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: Colors.primarySoft,
    alignItems: "center", justifyContent: "center", marginBottom: Spacing.md,
  },
  emptyTitle: { fontSize: 18, fontWeight: "800", color: Colors.textPrimary, marginTop: Spacing.md },
  emptyText: { color: Colors.textSecondary, marginTop: 6, textAlign: "center", fontSize: 13 },
  }));
}

