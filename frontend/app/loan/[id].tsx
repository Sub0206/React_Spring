import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert,
  ActivityIndicator, Modal, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../src/api";
import { Badge, Card, PrimaryButton, InitialsAvatar } from "../../src/ui";
import { Colors, Radii, Shadows, Spacing } from "../../src/theme";

type Entry = { month: number; due_date: string; amount: number; status: string; paid_at?: string | null; was_late?: boolean };
type Loan = {
  loan_id: string;
  borrower: { name: string; avatar?: string; occupation: string };
  principal: number; interest_rate: number; term_months: number;
  monthly_payment: number; total_repayment: number; paid_amount: number;
  status: string; repayment_schedule: Entry[]; funded_at: string;
};

const pad2 = (n: number) => String(n).padStart(2, "0");
const fmt = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

export default function LoanDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [loan, setLoan] = useState<Loan | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);

  // Mark-paid modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [activeEntry, setActiveEntry] = useState<Entry | null>(null);
  const [payDate, setPayDate] = useState<string>(fmt(new Date()));

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

  const openMarkPaid = (e: Entry) => {
    setActiveEntry(e);
    setPayDate(fmt(new Date()));
    setModalOpen(true);
  };

  const submitPay = async () => {
    if (!activeEntry) return;
    setPaying(true);
    try {
      // Send as ISO string at end-of-day in UTC
      const iso = new Date(`${payDate}T12:00:00Z`).toISOString();
      const d = await api<Loan>(`/loans/${id}/repay/${activeEntry.month}?paid_date=${encodeURIComponent(iso)}`, { method: "POST" });
      setLoan(d);
      setModalOpen(false);
      setActiveEntry(null);
      const due = new Date(activeEntry.due_date);
      const chosen = new Date(`${payDate}T12:00:00Z`);
      if (chosen > due) {
        Alert.alert("Payment recorded · Overdue", "This EMI was marked paid AFTER the due date and will now appear in the Overdue dashboard as 'Overdue Paid'.");
      } else {
        Alert.alert("Payment recorded", "EMI marked as paid on time.");
      }
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setPaying(false);
    }
  };

  // Date shift helpers for quick-pick
  const shiftDate = (iso: string, days: number) => {
    const d = new Date(`${iso}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return fmt(d);
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
          <InitialsAvatar name={loan.borrower.name} size={56} />
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{loan.borrower.name}</Text>
            <Text style={styles.meta}>Loan {loan.loan_id.slice(0, 10)}…</Text>
          </View>
          <Badge
            label={loan.status.toUpperCase()}
            color={loan.status === "active" ? Colors.success : loan.status === "completed" ? Colors.primary : Colors.danger}
          />
        </View>

        <Card style={{ marginTop: Spacing.md }}>
          <Text style={styles.label}>TOTAL PROGRESS</Text>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8, marginTop: 4 }}>
            <Text style={styles.bigAmount}>₹{loan.paid_amount.toLocaleString()}</Text>
            <Text style={styles.of}>of ₹{loan.total_repayment.toLocaleString()}</Text>
          </View>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${Math.min(100, progress)}%` }]} />
          </View>
          <Text style={styles.progressText}>{progress.toFixed(1)}% repaid</Text>
          <View style={styles.metaRow}>
            <View><Text style={styles.label}>Principal</Text><Text style={styles.value}>₹{loan.principal.toLocaleString()}</Text></View>
            <View><Text style={styles.label}>Monthly</Text><Text style={styles.value}>₹{loan.monthly_payment.toLocaleString()}</Text></View>
            <View><Text style={styles.label}>Rate</Text><Text style={styles.value}>{loan.interest_rate}%</Text></View>
          </View>
        </Card>

        <Text style={styles.sectionTitle}>Repayment schedule</Text>
        {loan.repayment_schedule.map((e) => {
          const isPaid = e.status === "paid";
          const isLate = !!e.was_late;
          const c = isPaid ? (isLate ? Colors.danger : Colors.success) : e.status === "overdue" ? Colors.danger : Colors.textSecondary;
          const icon = isPaid ? (isLate ? "alert-circle" : "checkmark-circle") : e.status === "overdue" ? "alert-circle" : "time-outline";
          return (
            <View
              key={e.month}
              testID={`schedule-row-${e.month}`}
              style={[
                styles.scheduleRow,
                isLate && styles.scheduleRowLate,
              ]}
            >
              <View style={[styles.scheduleIcon, { backgroundColor: c + "1A" }]}>
                <Ionicons name={icon as any} size={18} color={c} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <Text style={styles.scheduleTitle}>Month {e.month}</Text>
                  {isPaid && isLate && (
                    <View style={styles.overduePaidChip}>
                      <Ionicons name="warning" size={10} color="#fff" />
                      <Text style={styles.overduePaidText}>OVERDUE PAID</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.scheduleDate}>Due {new Date(e.due_date).toLocaleDateString()}</Text>
                {isPaid && e.paid_at && (
                  <Text style={[styles.scheduleDate, { color: isLate ? Colors.danger : Colors.success }]}>
                    Paid {new Date(e.paid_at).toLocaleDateString()}
                  </Text>
                )}
              </View>
              <Text style={styles.scheduleAmount}>₹{e.amount.toLocaleString()}</Text>
              {!isPaid && loan.status === "active" && (
                <TouchableOpacity
                  testID={`pay-month-${e.month}`}
                  onPress={() => openMarkPaid(e)}
                  style={styles.payBtn}
                >
                  <Text style={styles.payText}>Mark paid</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })}
      </ScrollView>

      {/* Mark paid modal */}
      <Modal
        visible={modalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setModalOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Record payment · Month {activeEntry?.month}</Text>
            <Text style={styles.modalSub}>
              Due {activeEntry ? new Date(activeEntry.due_date).toLocaleDateString() : ""} · ₹{activeEntry?.amount.toLocaleString()}
            </Text>

            <Text style={[styles.label, { marginTop: Spacing.md }]}>PAYMENT DATE</Text>

            {/* Native date picker on web; custom shifters on mobile */}
            {Platform.OS === "web" ? (
              // @ts-ignore react-native-web passes through DOM props
              <input
                type="date"
                value={payDate}
                onChange={(ev: any) => setPayDate(ev.target.value)}
                data-testid="pay-date-input"
                style={{
                  fontSize: 18, padding: 14, borderRadius: 12,
                  border: `2px solid ${Colors.border}`, fontWeight: 700,
                  color: Colors.textPrimary, backgroundColor: Colors.surface,
                  width: "100%", boxSizing: "border-box", marginTop: 6,
                } as any}
              />
            ) : (
              <View style={styles.dateStepper}>
                <TouchableOpacity onPress={() => setPayDate(shiftDate(payDate, -1))} style={styles.stepBtn}>
                  <Ionicons name="chevron-back" size={20} color={Colors.primary} />
                </TouchableOpacity>
                <Text testID="pay-date-value" style={styles.dateValue}>
                  {new Date(`${payDate}T12:00:00Z`).toLocaleDateString()}
                </Text>
                <TouchableOpacity onPress={() => setPayDate(shiftDate(payDate, 1))} style={styles.stepBtn}>
                  <Ionicons name="chevron-forward" size={20} color={Colors.primary} />
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.quickRow}>
              <TouchableOpacity onPress={() => setPayDate(fmt(new Date()))} style={styles.quickChip}>
                <Text style={styles.quickText}>Today</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => {
                const d = new Date(); d.setDate(d.getDate() - 1); setPayDate(fmt(d));
              }} style={styles.quickChip}>
                <Text style={styles.quickText}>Yesterday</Text>
              </TouchableOpacity>
              {activeEntry && (
                <TouchableOpacity onPress={() => setPayDate(fmt(new Date(activeEntry.due_date)))} style={styles.quickChip}>
                  <Text style={styles.quickText}>Due date</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Overdue warning */}
            {activeEntry && (() => {
              const due = new Date(activeEntry.due_date);
              const chosen = new Date(`${payDate}T12:00:00Z`);
              if (chosen > due) {
                return (
                  <View style={styles.warnBox}>
                    <Ionicons name="warning" size={18} color={Colors.danger} />
                    <Text style={styles.warnText}>
                      Payment is AFTER due date. This EMI will be marked as <Text style={{ fontWeight: "800" }}>Overdue Paid</Text> and shown in the Overdue dashboard.
                    </Text>
                  </View>
                );
              }
              return (
                <View style={styles.okBox}>
                  <Ionicons name="checkmark-circle" size={18} color={Colors.success} />
                  <Text style={styles.okText}>On-time payment.</Text>
                </View>
              );
            })()}

            <View style={{ height: Spacing.md }} />
            <PrimaryButton
              testID="confirm-pay"
              title={paying ? "Saving…" : `Confirm · ₹${activeEntry?.amount.toLocaleString() || 0}`}
              loading={paying}
              onPress={submitPay}
              variant="success"
            />
            <View style={{ height: Spacing.sm }} />
            <PrimaryButton title="Cancel" variant="secondary" onPress={() => setModalOpen(false)} disabled={paying} />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  topBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  backBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.surface, alignItems: "center", justifyContent: "center", ...Shadows.card },
  topTitle: { flex: 1, textAlign: "center", fontSize: 18, fontWeight: "800", color: Colors.textPrimary },
  borrowerHeader: { flexDirection: "row", alignItems: "center", gap: Spacing.md },
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
  scheduleRowLate: { backgroundColor: "#FFF0F3", borderLeftWidth: 4, borderLeftColor: Colors.danger },
  scheduleIcon: { width: 36, height: 36, borderRadius: Radii.pill, alignItems: "center", justifyContent: "center" },
  scheduleTitle: { fontSize: 14, fontWeight: "700", color: Colors.textPrimary },
  scheduleDate: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  scheduleAmount: { fontSize: 15, fontWeight: "800", color: Colors.textPrimary },
  overduePaidChip: {
    flexDirection: "row", alignItems: "center", gap: 3,
    backgroundColor: Colors.danger, paddingHorizontal: 6, paddingVertical: 2, borderRadius: Radii.pill,
  },
  overduePaidText: { color: "#fff", fontSize: 9, fontWeight: "800", letterSpacing: 0.5 },
  payBtn: {
    backgroundColor: Colors.primary, paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: Radii.pill, minHeight: 40, alignItems: "center", justifyContent: "center",
  },
  payText: { color: "#fff", fontSize: 12, fontWeight: "800" },

  modalBackdrop: { flex: 1, backgroundColor: "#00000099", justifyContent: "flex-end" },
  modalSheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: Spacing.lg, paddingBottom: Spacing.xxl,
  },
  modalHandle: {
    width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.border,
    alignSelf: "center", marginBottom: Spacing.md,
  },
  modalTitle: { fontSize: 20, fontWeight: "800", color: Colors.textPrimary },
  modalSub: { color: Colors.textSecondary, marginTop: 4, fontSize: 13 },
  dateStepper: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: Colors.bgAlt, borderRadius: Radii.md, padding: 10, marginTop: 6,
  },
  stepBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: Colors.surface },
  dateValue: { fontSize: 18, fontWeight: "800", color: Colors.textPrimary, flex: 1, textAlign: "center" },
  quickRow: { flexDirection: "row", gap: 8, marginTop: 10, flexWrap: "wrap" },
  quickChip: { paddingHorizontal: 12, paddingVertical: 7, backgroundColor: Colors.primary + "15", borderRadius: Radii.pill },
  quickText: { color: Colors.primary, fontWeight: "700", fontSize: 12 },
  warnBox: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    backgroundColor: Colors.danger + "12", borderRadius: Radii.md,
    padding: Spacing.md, marginTop: Spacing.md,
    borderWidth: 1, borderColor: Colors.danger + "44",
  },
  warnText: { flex: 1, color: Colors.textPrimary, fontSize: 13, lineHeight: 18 },
  okBox: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: Colors.success + "15", borderRadius: Radii.md,
    padding: Spacing.md, marginTop: Spacing.md,
  },
  okText: { color: Colors.textPrimary, fontSize: 13, fontWeight: "600" },
});
