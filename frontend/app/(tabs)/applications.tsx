import React, { useCallback, useState } from "react";
import {
  View, Text, StyleSheet, FlatList, Image, TouchableOpacity, RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../src/api";
import { Badge } from "../../src/ui";
import { Colors, Radii, Shadows, Spacing } from "../../src/theme";

type App = {
  application_id: string;
  borrower: { name: string; avatar?: string; occupation: string };
  amount: number;
  purpose: string;
  term_months: number;
  interest_rate: number;
  status: string;
  ai_score?: number | null;
  ai_risk?: string | null;
  created_at: string;
};

const FILTERS = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "funded", label: "Funded" },
];

function riskColor(risk?: string | null) {
  if (risk === "low") return Colors.success;
  if (risk === "medium") return Colors.secondary;
  if (risk === "high") return Colors.danger;
  return Colors.textMuted;
}

export default function Applications() {
  const router = useRouter();
  const [filter, setFilter] = useState("pending");
  const [items, setItems] = useState<App[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<App[]>(`/applications?status=${filter}`);
      setItems(data);
    } catch (e) {
      console.log("apps err", e);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useFocusEffect(useCallback(() => {
    load();
  }, [load]));

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Loan Requests</Text>
        <Text style={styles.subtitle}>AI-scored applications ready for review</Text>
      </View>

      <View style={styles.filters}>
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f.key}
            testID={`filter-${f.key}`}
            onPress={() => setFilter(f.key)}
            style={[styles.filter, filter === f.key && styles.filterActive]}
          >
            <Text style={[styles.filterText, filter === f.key && styles.filterTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        testID="applications-list"
        data={items}
        keyExtractor={(i) => i.application_id}
        contentContainerStyle={{ padding: Spacing.lg, paddingTop: Spacing.sm, paddingBottom: Spacing.xxl }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Image
              source={{ uri: "https://static.prod-images.emergentagent.com/jobs/b97ea820-9246-4c66-95e8-0a7c3405dd9e/images/5290229345035e501b9fd2dbaadf464235420cbe6505544b1da1bb3afb5f71e5.png" }}
              style={{ width: 120, height: 120 }}
            />
            <Text style={styles.emptyTitle}>No {filter} requests</Text>
            <Text style={styles.emptyText}>Pull to refresh or check back later.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            testID={`app-item-${item.application_id}`}
            onPress={() => router.push({ pathname: "/application/[id]", params: { id: item.application_id } })}
            activeOpacity={0.9}
            style={styles.card}
          >
            <Image
              source={{ uri: item.borrower.avatar || "https://via.placeholder.com/60" }}
              style={styles.avatar}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.borrower.name}</Text>
              <Text style={styles.meta} numberOfLines={1}>
                {item.purpose} · {item.term_months}mo · {item.interest_rate}% APR
              </Text>
              <View style={styles.badges}>
                {item.ai_score != null ? (
                  <Badge label={`AI ${item.ai_score}`} color={Colors.primary} />
                ) : (
                  <Badge label="Tap to score" color={Colors.textMuted} />
                )}
                {item.ai_risk && (
                  <Badge label={`${item.ai_risk.toUpperCase()} risk`} color={riskColor(item.ai_risk)} />
                )}
              </View>
            </View>
            <View style={styles.right}>
              <Text style={styles.amount}>${item.amount.toLocaleString()}</Text>
              <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
            </View>
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm, paddingBottom: Spacing.md },
  title: { fontSize: 26, fontWeight: "800", color: Colors.textPrimary },
  subtitle: { color: Colors.textSecondary, marginTop: 2 },
  filters: { flexDirection: "row", gap: 8, paddingHorizontal: Spacing.lg, marginBottom: Spacing.sm, flexWrap: "wrap" },
  filter: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: Radii.pill,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
  },
  filterActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterText: { color: Colors.textSecondary, fontWeight: "700", fontSize: 13 },
  filterTextActive: { color: "#fff" },
  card: {
    flexDirection: "row", alignItems: "center", gap: Spacing.md,
    backgroundColor: Colors.surface, borderRadius: Radii.xl,
    padding: Spacing.md, marginBottom: 12, ...Shadows.card,
  },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.bgAlt },
  name: { fontSize: 16, fontWeight: "700", color: Colors.textPrimary },
  meta: { color: Colors.textSecondary, fontSize: 13, marginTop: 2 },
  badges: { flexDirection: "row", gap: 6, marginTop: 8, flexWrap: "wrap" },
  right: { alignItems: "flex-end" },
  amount: { fontSize: 16, fontWeight: "800", color: Colors.textPrimary, marginBottom: 4 },
  empty: { alignItems: "center", marginTop: Spacing.xxl, padding: Spacing.lg },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: Colors.textPrimary, marginTop: Spacing.md },
  emptyText: { color: Colors.textSecondary, marginTop: 6, textAlign: "center" },
});
