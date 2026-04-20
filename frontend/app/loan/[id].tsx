import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Image, TouchableOpacity, Alert, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../src/api";
import { Badge, Card } from "../../src/ui";
import { Colors, Radii, Shadows, Spacing } from "../../src/theme";

type Entry = { month: number; due_date: string; amount: number; status: string };
type Loan = {
  loan_id: string;
  borrower: { name: string; avatar?: string; occupation: string };
  principal: number; interest_rate: number; term_months: number;
  monthly_payment: number; total_repayment: number; paid_amount: number;
  status: string; repayment_schedule: Entry[]; funded_at: string;
};

export default function LoanDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [loan, setLoan] = useState<Loan | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      setLoan(await api<Loan>(`/loans/${id}`));
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const pay = async (month: number) => {
    setPaying(month);
    try {
      const d = await api<Loan>(`/loans/${id}/repay/${month}`, { method: "POST" });
      setLoan(d);
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setPaying(null);
    }
  };

  if (loading || !loan) {
    return (
      <SafeAreaView style={styles.safe}>
        <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 80 }} />
      </SafeAreaView>
    );
  }

  const progress = loan.total_repayment > 0 ? (loan.paid_amount / loan.total_repayment) * 100 : 0;

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.topBar}>
        <TouchableOpacity testID="back-btn" onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.topTitle}>Loan Details</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: Spacing.lg, paddingBottom: Spacing.xxl }}>
        <View style={styles.borrowerHeader}>
          <Image source={{ uri: loan.borrower.avatar || "https://via.placeholder.com/80" }} style={styles.avatar} />
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{loan.borrower.name}</Text>
            <Text style={styles.meta}>{loan.borrower.occupation}</Text>
          </View>
          <Badge
            label={loan.status.toUpperCase()}
            color={loan.status === "active" ? Colors.success : loan.status === "completed" ? Colors.primary : Colors.danger}
          />
        </View>

        <Card style={{ marginTop: Spacing.md }}>
          <Text style={styles.label}>TOTAL PROGRESS</Text>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8, marginTop: 4 }}>
            <Text style={styles.bigAmount}>${loan.paid_amount.toLocaleString()}</Text>
            <Text style={styles.of}>of ${loan.total_repayment.toLocaleString()}</Text>
          </View>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${Math.min(100, progress)}%` }]} />
          </View>
          <Text style={styles.progressText}>{progress.toFixed(1)}% repaid</Text>
          <View style={styles.metaRow}>
            <View><Text style={styles.label}>Principal</Text><Text style={styles.value}>${loan.principal.toLocaleString()}</Text></View>
            <View><Text style={styles.label}>Monthly</Text><Text style={styles.value}>${loan.monthly_payment.toLocaleString()}</Text></View>
            <View><Text style={styles.label}>Rate</Text><Text style={styles.value}>{loan.interest_rate}%</Text></View>
          </View>
        </Card>

        <Text style={styles.sectionTitle}>Repayment schedule</Text>
        {loan.repayment_schedule.map((e) => {
          const c = e.status === "paid" ? Colors.success : e.status === "overdue" ? Colors.danger : Colors.textSecondary;
          const icon = e.status === "paid" ? "checkmark-circle" : e.status === "overdue" ? "alert-circle" : "time-outline";
          return (
            <View key={e.month} style={styles.scheduleRow}>
              <View style={[styles.scheduleIcon, { backgroundColor: c + "1A" }]}>
                <Ionicons name={icon as any} size={18} color={c} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.scheduleTitle}>Month {e.month}</Text>
                <Text style={styles.scheduleDate}>Due {new Date(e.due_date).toLocaleDateString()}</Text>
              </View>
              <Text style={styles.scheduleAmount}>${e.amount.toLocaleString()}</Text>
              {e.status !== "paid" && loan.status === "active" && (
                <TouchableOpacity
                  testID={`pay-month-${e.month}`}
                  onPress={() => pay(e.month)}
                  disabled={paying !== null}
                  style={styles.payBtn}
                >
                  {paying === e.month ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.payText}>Mark paid</Text>
                  )}
                </TouchableOpacity>
              )}
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  topBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  backBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.surface, alignItems: "center", justifyContent: "center", ...Shadows.card },
  topTitle: { flex: 1, textAlign: "center", fontSize: 18, fontWeight: "800", color: Colors.textPrimary },
  borrowerHeader: { flexDirection: "row", alignItems: "center", gap: Spacing.md },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.bgAlt },
  name: { fontSize: 18, fontWeight: "800", color: Colors.textPrimary },
  meta: { color: Colors.textSecondary, fontSize: 13, marginTop: 2 },
  label: { fontSize: 11, color: Colors.textMuted, fontWeight: "700", letterSpacing: 0.5 },
  bigAmount: { fontSize: 32, fontWeight: "800", color: Colors.textPrimary, letterSpacing: -0.5 },
  of: { color: Colors.textSecondary, fontSize: 14 },
  progressBar: { height: 10, backgroundColor: Colors.bgAlt, borderRadius: 8, marginTop: Spacing.md, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: Colors.success, borderRadius: 8 },
  progressText: { color: Colors.textSecondary, fontSize: 13, marginTop: 6, fontWeight: "600" },
  metaRow: { flexDirection: "row", justifyContent: "space-between", marginTop: Spacing.md },
  value: { fontSize: 15, fontWeight: "700", color: Colors.textPrimary, marginTop: 2 },
  sectionTitle: { fontSize: 18, fontWeight: "800", color: Colors.textPrimary, marginTop: Spacing.lg, marginBottom: Spacing.sm },
  scheduleRow: {
    flexDirection: "row", alignItems: "center", gap: Spacing.md,
    backgroundColor: Colors.surface, borderRadius: Radii.lg,
    padding: Spacing.md, marginBottom: 8, ...Shadows.card,
  },
  scheduleIcon: { width: 36, height: 36, borderRadius: Radii.pill, alignItems: "center", justifyContent: "center" },
  scheduleTitle: { fontSize: 14, fontWeight: "700", color: Colors.textPrimary },
  scheduleDate: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  scheduleAmount: { fontSize: 15, fontWeight: "800", color: Colors.textPrimary },
  payBtn: {
    backgroundColor: Colors.primary, paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: Radii.pill,
  },
  payText: { color: "#fff", fontSize: 12, fontWeight: "800" },
});
