import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, FlatList, RefreshControl, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../src/api";
import { Colors, Radii, Shadows, Spacing } from "../src/theme";
import { useThemedStyles } from "../src/themeContext";

type OverdueLoan = {
  loan_id: string; client_id?: string; borrower_name: string;
  overdue_count: number; overdue_amount: number; principal: number;
  overdue_entries: { month: number; due_date: string; amount: number; days_late: number }[];
};

export default function Overdue() {
  const styles = useScreenStyles();
  const router = useRouter();
  const [items, setItems] = useState<OverdueLoan[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api<{ overdue_loans: OverdueLoan[] }>("/dashboard/overdue");
      setItems(r.overdue_loans);
    } finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.topBar}>
        <TouchableOpacity testID="back-overdue" onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.topTitle}>Overdue Clients</Text>
        <View style={{ width: 40 }} />
      </View>

      <FlatList
        testID="overdue-list"
        data={items}
        keyExtractor={(i) => i.loan_id}
        contentContainerStyle={{ padding: Spacing.lg, paddingBottom: Spacing.xxl }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        ListEmptyComponent={
          <View style={{ alignItems: "center", marginTop: Spacing.xxl }}>
            <Ionicons name="checkmark-circle" size={60} color={Colors.success} />
            <Text style={styles.emptyTitle}>No overdue payments 🎉</Text>
            <Text style={styles.emptyText}>All clients are paying on time.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            testID={`overdue-item-${item.loan_id}`}
            onPress={() => router.push({ pathname: "/loan/[id]", params: { id: item.loan_id } })}
            activeOpacity={0.9}
            style={styles.card}
          >
            <View style={styles.initials}>
              <Text style={styles.initialsText}>{item.borrower_name.slice(0, 1).toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.borrower_name}</Text>
              <Text style={styles.meta}>Principal ₹{item.principal.toLocaleString()}</Text>
              <View style={styles.chip}>
                <Ionicons name="warning" size={11} color="#fff" />
                <Text style={styles.chipText}>{item.overdue_count} EMI overdue · ₹{item.overdue_amount.toLocaleString()}</Text>
              </View>
              {item.overdue_entries.slice(0, 2).map((e) => (
                <Text key={e.month} style={styles.entryLine}>
                  · Month {e.month} · Due {new Date(e.due_date).toLocaleDateString()} · {e.days_late}d late
                </Text>
              ))}
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  );
}

function useScreenStyles() {
  return useThemedStyles(() => StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  topBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, backgroundColor: Colors.danger },
  backBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  topTitle: { flex: 1, textAlign: "center", fontSize: 18, fontWeight: "800", color: "#fff" },
  card: {
    flexDirection: "row", alignItems: "center", gap: Spacing.md,
    backgroundColor: Colors.surface, borderRadius: Radii.lg, padding: Spacing.md, marginBottom: 10, ...Shadows.card,
    borderLeftWidth: 4, borderLeftColor: Colors.danger,
  },
  initials: { width: 52, height: 52, borderRadius: 26, backgroundColor: Colors.danger + "1A", alignItems: "center", justifyContent: "center" },
  initialsText: { color: Colors.danger, fontSize: 22, fontWeight: "800" },
  name: { fontSize: 16, fontWeight: "800", color: Colors.textPrimary },
  meta: { color: Colors.textSecondary, fontSize: 12, marginTop: 2 },
  chip: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: Colors.danger, paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: Radii.pill, alignSelf: "flex-start", marginTop: 6,
  },
  chipText: { color: "#fff", fontSize: 11, fontWeight: "800" },
  entryLine: { color: Colors.textSecondary, fontSize: 11, marginTop: 3 },
  emptyTitle: { fontSize: 20, fontWeight: "800", color: Colors.textPrimary, marginTop: Spacing.md },
  emptyText: { color: Colors.textSecondary, marginTop: 6 },
  }));
}

