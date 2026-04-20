import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, FlatList, Image, TouchableOpacity, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../src/api";
import { Badge } from "../../src/ui";
import { Colors, Radii, Shadows, Spacing } from "../../src/theme";

type Loan = {
  loan_id: string;
  borrower: { name: string; avatar?: string; occupation: string };
  principal: number;
  interest_rate: number;
  term_months: number;
  monthly_payment: number;
  total_repayment: number;
  paid_amount: number;
  status: string;
};

export default function Loans() {
  const router = useRouter();
  const [items, setItems] = useState<Loan[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<Loan[]>("/loans");
      setItems(data);
    } catch (e) {
      console.log("loans err", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Active Loans</Text>
        <Text style={styles.subtitle}>Track repayments and loan performance</Text>
      </View>

      <FlatList
        testID="loans-list"
        data={items}
        keyExtractor={(i) => i.loan_id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        contentContainerStyle={{ padding: Spacing.lg, paddingBottom: Spacing.xxl }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Image
              source={{ uri: "https://static.prod-images.emergentagent.com/jobs/b97ea820-9246-4c66-95e8-0a7c3405dd9e/images/4a0947b8cd90531a45ae3e944cd02aa2374f9d367cc31d65c418fd3ac460f818.png" }}
              style={{ width: 120, height: 120 }}
            />
            <Text style={styles.emptyTitle}>No loans yet</Text>
            <Text style={styles.emptyText}>Fund your first approved application to see it here.</Text>
          </View>
        }
        renderItem={({ item }) => {
          const progress = item.total_repayment > 0 ? (item.paid_amount / item.total_repayment) * 100 : 0;
          return (
            <TouchableOpacity
              testID={`loan-item-${item.loan_id}`}
              activeOpacity={0.9}
              onPress={() => router.push({ pathname: "/loan/[id]", params: { id: item.loan_id } })}
              style={styles.card}
            >
              <View style={styles.row}>
                <Image source={{ uri: item.borrower.avatar || "https://via.placeholder.com/60" }} style={styles.avatar} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{item.borrower.name}</Text>
                  <Text style={styles.meta}>{item.borrower.occupation}</Text>
                </View>
                <Badge
                  label={item.status.toUpperCase()}
                  color={item.status === "active" ? Colors.success : item.status === "completed" ? Colors.primary : Colors.danger}
                />
              </View>

              <View style={styles.amountRow}>
                <View>
                  <Text style={styles.label}>Principal</Text>
                  <Text style={styles.value}>${item.principal.toLocaleString()}</Text>
                </View>
                <View>
                  <Text style={styles.label}>Monthly</Text>
                  <Text style={styles.value}>${item.monthly_payment.toLocaleString()}</Text>
                </View>
                <View>
                  <Text style={styles.label}>Paid</Text>
                  <Text style={styles.value}>${item.paid_amount.toLocaleString()}</Text>
                </View>
              </View>

              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${Math.min(100, progress)}%` }]} />
              </View>
              <View style={styles.progressLabels}>
                <Text style={styles.progressText}>{progress.toFixed(0)}% repaid</Text>
                <Text style={styles.progressText}>Total: ${item.total_repayment.toLocaleString()}</Text>
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
  header: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm, paddingBottom: Spacing.md },
  title: { fontSize: 26, fontWeight: "800", color: Colors.textPrimary },
  subtitle: { color: Colors.textSecondary, marginTop: 2 },
  card: { backgroundColor: Colors.surface, borderRadius: Radii.xl, padding: Spacing.lg, marginBottom: 12, ...Shadows.card },
  row: { flexDirection: "row", alignItems: "center", gap: Spacing.md },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: Colors.bgAlt },
  name: { fontSize: 16, fontWeight: "700", color: Colors.textPrimary },
  meta: { fontSize: 13, color: Colors.textSecondary },
  amountRow: { flexDirection: "row", justifyContent: "space-between", marginTop: Spacing.md },
  label: { fontSize: 11, color: Colors.textMuted, fontWeight: "700", letterSpacing: 0.5 },
  value: { fontSize: 16, fontWeight: "800", color: Colors.textPrimary, marginTop: 2 },
  progressBar: { height: 8, backgroundColor: Colors.bgAlt, borderRadius: 8, marginTop: Spacing.md, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: Colors.success, borderRadius: 8 },
  progressLabels: { flexDirection: "row", justifyContent: "space-between", marginTop: 6 },
  progressText: { fontSize: 12, color: Colors.textSecondary, fontWeight: "600" },
  empty: { alignItems: "center", marginTop: Spacing.xxl, padding: Spacing.lg },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: Colors.textPrimary, marginTop: Spacing.md },
  emptyText: { color: Colors.textSecondary, marginTop: 6, textAlign: "center" },
});
