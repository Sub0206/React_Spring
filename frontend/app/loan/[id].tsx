import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert,
  ActivityIndicator, Modal, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../src/api";
import { Card, PrimaryButton, InitialsAvatar } from "../../src/ui";
import { Colors, Radii, Shadows, Spacing } from "../../src/theme";

type Entry = { month: number; due_date: string; amount: number; status: string; paid_at?: string | null; was_late?: boolean };
type Loan = {
  loan_id: string;
  borrower: { name: string; avatar?: string; occupation?: string };
  principal: number; interest_rate: number; term_months: number;
  monthly_payment: number; total_repayment: number; paid_amount: number;
  status: string; repayment_schedule: Entry[]; funded_at: string;
};

const pad2 = (n: number) => String(n).padStart(2, "0");
const fmt = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

// Classify an EMI relative to today's calendar month
type Bucket = "past" | "current" | "future";
function bucketOf(due: Date, now = new Date()): Bucket {
  const dy = due.getFullYear(), dm = due.getMonth();
  const ny = now.getFullYear(), nm = now.getMonth();
  if (dy < ny || (dy === ny && dm < nm)) return "past";
  if (dy > ny || (dy === ny && dm > nm)) return "future";
  return "current";
}

type Action = "none" | "pay" | "reschedule" | "undo";

export default function LoanDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [loan, setLoan] = useState<Loan | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Modal state
  const [action, setAction] = useState<Action>("none");
  const [active, setActive] = useState<Entry | null>(null);
  const [dateValue, setDateValue] = useState<string>(fmt(new Date()));

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

  const openPay = (e: Entry) => {
    setActive(e); setDateValue(fmt(new Date())); setAction("pay");
  };
  const openReschedule = (e: Entry) => {
    setActive(e);
    const d = new Date(e.due_date);
    setDateValue(fmt(d));
    setAction("reschedule");
  };
  const confirmUndo = (e: Entry) => {
    Alert.alert(
      "Rollback payment?",
      `This will revert Month ${e.month} (₹${e.amount.toLocaleString()}) back to unpaid. Balance and dashboard counts will update.\n\nThis action is safe but should be used carefully.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Yes, undo", style: "destructive", onPress: () => submitUndo(e) },
      ],
    );
  };

  const submitPay = async () => {
    if (!active) return;
    setSaving(true);
    try {
      const iso = new Date(`${dateValue}T12:00:00Z`).toISOString();
      const d = await api<Loan>(
        `/loans/${id}/repay/${active.month}?paid_date=${encodeURIComponent(iso)}`,
        { method: "POST" },
      );
      setLoan(d); setAction("none"); setActive(null);
      const due = new Date(active.due_date);
      const chosen = new Date(`${dateValue}T12:00:00Z`);
      Alert.alert(
        chosen > due ? "Payment recorded · Overdue" : "Payment recorded",
        chosen > due
          ? "This EMI was paid AFTER the due date. It will appear in the Overdue dashboard."
          : "EMI marked as paid on time.",
      );
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally { setSaving(false); }
  };

  const submitReschedule = async () => {
    if (!active) return;
    setSaving(true);
    try {
      const iso = new Date(`${dateValue}T12:00:00Z`).toISOString();
      const d = await api<Loan>(
        `/loans/${id}/reschedule/${active.month}?new_due_date=${encodeURIComponent(iso)}`,
        { method: "POST" },
      );
      setLoan(d); setAction("none"); setActive(null);
      Alert.alert("EMI rescheduled", `Month ${active.month} moved to ${new Date(iso).toLocaleDateString()}.`);
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally { setSaving(false); }
  };

  const submitUndo = async (e: Entry) => {
    setSaving(true);
    try {
      const d = await api<Loan>(`/loans/${id}/undo-pay/${e.month}`, { method: "POST" });
      setLoan(d);
      Alert.alert("Payment rolled back", `Month ${e.month} is back to unpaid. Dashboard updated.`);
    } catch (err: any) {
      Alert.alert("Error", err.message);
    } finally { setSaving(false); }
  };

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
  const nowForBucket = new Date();

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
          <View style={[styles.badge, { backgroundColor: (loan.status === "active" ? Colors.success : loan.status === "completed" ? Colors.primary : Colors.danger) + "1A" }]}>
            <Text style={[styles.badgeText, { color: loan.status === "active" ? Colors.success : loan.status === "completed" ? Colors.primary : Colors.danger }]}>
              {loan.status.toUpperCase()}
            </Text>
          </View>
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

        <View style={styles.legendRow}>
          <Legend label="Current month" color={Colors.primary} icon="flash" />
          <Legend label="Past" color={Colors.textMuted} icon="lock-closed" />
          <Legend label="Future" color={Colors.textMuted} icon="calendar-outline" />
        </View>

        <Text style={styles.sectionTitle}>Repayment schedule</Text>
        {loan.repayment_schedule.map((e) => {
          const due = new Date(e.due_date);
          const bucket = bucketOf(due, nowForBucket);
          const isPaid = e.status === "paid";
          const isLate = !!e.was_late;
          const isOverdue = !isPaid && due.getTime() < nowForBucket.getTime() && bucket !== "current";

          const c = isPaid
            ? (isLate ? Colors.danger : Colors.success)
            : isOverdue ? Colors.danger : bucket === "current" ? Colors.primary : Colors.textMuted;
          const icon = isPaid
            ? (isLate ? "alert-circle" : "checkmark-circle")
            : isOverdue ? "alert-circle" : bucket === "current" ? "flash" : bucket === "past" ? "lock-closed" : "time-outline";

          // Only current-month row gets active action buttons
          const canPay       = bucket === "current" && !isPaid && loan.status === "active";
          const canResched   = bucket === "current" && !isPaid && loan.status === "active";
          const canUndo      = bucket === "current" && isPaid  && loan.status !== "completed";

          const statusLabel = isPaid
            ? (isLate ? "OVERDUE PAID" : "PAID")
            : isOverdue ? "OVERDUE"
            : bucket === "current" ? "DUE NOW"
            : bucket === "past" ? "MISSED"
            : "UPCOMING";

          return (
            <View
              key={e.month}
              testID={`schedule-row-${e.month}`}
              style={[
                styles.row,
                bucket === "current" && styles.rowCurrent,
                isLate && styles.rowLate,
                isOverdue && styles.rowOverdue,
                bucket === "future" && styles.rowLocked,
                bucket === "past" && !isPaid && styles.rowPastMissed,
              ]}
            >
              <View style={styles.rowHead}>
                <View style={[styles.rowIcon, { backgroundColor: c + "1A" }]}>
                  <Ionicons name={icon as any} size={18} color={c} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text style={styles.rowTitle}>Month {e.month}</Text>
                    <View style={[styles.statusPill, { backgroundColor: c + "1A" }]}>
                      <Text style={[styles.statusPillText, { color: c }]}>{statusLabel}</Text>
                    </View>
                  </View>
                  <Text style={styles.rowDate}>Due {due.toLocaleDateString()}</Text>
                  {isPaid && e.paid_at && (
                    <Text style={[styles.rowDate, { color: isLate ? Colors.danger : Colors.success, fontWeight: "700" }]}>
                      Paid {new Date(e.paid_at).toLocaleDateString()}
                    </Text>
                  )}
                </View>
                <Text style={styles.rowAmount}>₹{e.amount.toLocaleString()}</Text>
              </View>

              {/* Action buttons — ONLY for current month */}
              {(canPay || canResched || canUndo) && (
                <View style={styles.actionRow}>
                  {canPay && (
                    <TouchableOpacity
                      testID={`pay-month-${e.month}`}
                      onPress={() => openPay(e)}
                      activeOpacity={0.85}
                      style={[styles.actionBtn, styles.actionPay]}
                    >
                      <Ionicons name="checkmark-circle" size={15} color="#fff" />
                      <Text style={styles.actionPayText}>Mark paid</Text>
                    </TouchableOpacity>
                  )}
                  {canResched && (
                    <TouchableOpacity
                      testID={`reschedule-month-${e.month}`}
                      onPress={() => openReschedule(e)}
                      activeOpacity={0.85}
                      style={[styles.actionBtn, styles.actionReschedule]}
                    >
                      <Ionicons name="calendar" size={15} color={Colors.primary} />
                      <Text style={styles.actionRescheduleText}>Reschedule</Text>
                    </TouchableOpacity>
                  )}
                  {canUndo && (
                    <TouchableOpacity
                      testID={`undo-month-${e.month}`}
                      onPress={() => confirmUndo(e)}
                      activeOpacity={0.85}
                      style={[styles.actionBtn, styles.actionUndo]}
                    >
                      <Ionicons name="arrow-undo" size={15} color={Colors.danger} />
                      <Text style={styles.actionUndoText}>Undo payment</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {/* Locked notice for future/past */}
              {bucket === "future" && !isPaid && (
                <View style={styles.lockedNotice}>
                  <Ionicons name="lock-closed" size={12} color={Colors.textMuted} />
                  <Text style={styles.lockedText}>Available when this month is active</Text>
                </View>
              )}
              {bucket === "past" && !isPaid && (
                <View style={styles.lockedNotice}>
                  <Ionicons name="information-circle" size={12} color={Colors.danger} />
                  <Text style={[styles.lockedText, { color: Colors.danger }]}>
                    Missed payment · Listed in Overdue dashboard
                  </Text>
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>

      {/* Unified modal for Pay + Reschedule */}
      <Modal
        visible={action === "pay" || action === "reschedule"}
        transparent
        animationType="slide"
        onRequestClose={() => setAction("none")}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>
              {action === "pay" ? "Record payment" : "Reschedule EMI"} · Month {active?.month}
            </Text>
            <Text style={styles.modalSub}>
              Due {active ? new Date(active.due_date).toLocaleDateString() : ""} · ₹{active?.amount.toLocaleString()}
            </Text>

            <Text style={[styles.label, { marginTop: Spacing.md }]}>
              {action === "pay" ? "PAYMENT DATE" : "NEW DUE DATE"}
            </Text>

            {Platform.OS === "web" ? (
              // @ts-ignore RN-Web passthrough
              <input
                type="date"
                value={dateValue}
                onChange={(ev: any) => setDateValue(ev.target.value)}
                data-testid="date-input"
                style={{
                  fontSize: 18, padding: 14, borderRadius: 12,
                  border: `2px solid ${Colors.border}`, fontWeight: 700,
                  color: Colors.textPrimary, backgroundColor: Colors.surface,
                  width: "100%", boxSizing: "border-box", marginTop: 6,
                } as any}
              />
            ) : (
              <View style={styles.dateStepper}>
                <TouchableOpacity onPress={() => setDateValue(shiftDate(dateValue, -1))} style={styles.stepBtn}>
                  <Ionicons name="chevron-back" size={20} color={Colors.primary} />
                </TouchableOpacity>
                <Text testID="date-value" style={styles.dateValue}>
                  {new Date(`${dateValue}T12:00:00Z`).toLocaleDateString()}
                </Text>
                <TouchableOpacity onPress={() => setDateValue(shiftDate(dateValue, 1))} style={styles.stepBtn}>
                  <Ionicons name="chevron-forward" size={20} color={Colors.primary} />
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.quickRow}>
              {action === "pay" && (
                <>
                  <TouchableOpacity onPress={() => setDateValue(fmt(new Date()))} style={styles.quickChip}>
                    <Text style={styles.quickText}>Today</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setDateValue(shiftDate(fmt(new Date()), -1))} style={styles.quickChip}>
                    <Text style={styles.quickText}>Yesterday</Text>
                  </TouchableOpacity>
                  {active && (
                    <TouchableOpacity onPress={() => setDateValue(fmt(new Date(active.due_date)))} style={styles.quickChip}>
                      <Text style={styles.quickText}>Due date</Text>
                    </TouchableOpacity>
                  )}
                </>
              )}
              {action === "reschedule" && (
                <>
                  <TouchableOpacity onPress={() => setDateValue(shiftDate(dateValue, 7))} style={styles.quickChip}>
                    <Text style={styles.quickText}>+7 days</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setDateValue(shiftDate(dateValue, 15))} style={styles.quickChip}>
                    <Text style={styles.quickText}>+15 days</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setDateValue(shiftDate(dateValue, 30))} style={styles.quickChip}>
                    <Text style={styles.quickText}>+30 days</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>

            {action === "pay" && active && (() => {
              const due = new Date(active.due_date);
              const chosen = new Date(`${dateValue}T12:00:00Z`);
              if (chosen > due) {
                return (
                  <View style={styles.warnBox}>
                    <Ionicons name="warning" size={18} color={Colors.danger} />
                    <Text style={styles.warnText}>
                      After due date — will be marked <Text style={{ fontWeight: "800" }}>Overdue Paid</Text>.
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
              testID="confirm-action"
              title={
                saving
                  ? "Saving…"
                  : action === "pay"
                  ? `Confirm payment · ₹${active?.amount.toLocaleString() || 0}`
                  : "Confirm new due date"
              }
              loading={saving}
              onPress={action === "pay" ? submitPay : submitReschedule}
              variant={action === "pay" ? "success" : "primary"}
            />
            <View style={{ height: Spacing.sm }} />
            <PrimaryButton title="Cancel" variant="secondary" onPress={() => setAction("none")} disabled={saving} />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Legend({ label, color, icon }: { label: string; color: string; icon: any }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 4, paddingHorizontal: 8, backgroundColor: color + "12", borderRadius: Radii.pill }}>
      <Ionicons name={icon} size={11} color={color} />
      <Text style={{ color, fontSize: 10, fontWeight: "800", letterSpacing: 0.3 }}>{label}</Text>
    </View>
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
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radii.pill },
  badgeText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.6 },

  label: { fontSize: 11, color: Colors.textMuted, fontWeight: "800", letterSpacing: 0.5 },
  bigAmount: { fontSize: 32, fontWeight: "800", color: Colors.textPrimary, letterSpacing: -0.5 },
  of: { color: Colors.textSecondary, fontSize: 14 },
  progressBar: { height: 10, backgroundColor: Colors.bgAlt, borderRadius: 8, marginTop: Spacing.md, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: Colors.success, borderRadius: 8 },
  progressText: { color: Colors.textSecondary, fontSize: 13, marginTop: 6, fontWeight: "600" },
  metaRow: { flexDirection: "row", justifyContent: "space-between", marginTop: Spacing.md },
  value: { fontSize: 15, fontWeight: "800", color: Colors.textPrimary, marginTop: 2 },

  legendRow: { flexDirection: "row", gap: 6, marginTop: Spacing.md, flexWrap: "wrap" },
  sectionTitle: { fontSize: 18, fontWeight: "800", color: Colors.textPrimary, marginTop: Spacing.lg, marginBottom: Spacing.sm },

  row: {
    backgroundColor: Colors.surface, borderRadius: Radii.lg,
    padding: Spacing.md, marginBottom: 10, ...Shadows.card,
    borderWidth: 1, borderColor: Colors.borderLight,
  },
  rowCurrent: { borderColor: Colors.primary, borderWidth: 2, ...Shadows.button },
  rowLate: { backgroundColor: "#FFF8F8" },
  rowOverdue: { backgroundColor: "#FFF5F5", borderColor: Colors.danger + "55", borderWidth: 1.5 },
  rowLocked: { opacity: 0.72, backgroundColor: Colors.bgAlt },
  rowPastMissed: { opacity: 0.9 },
  rowHead: { flexDirection: "row", alignItems: "center", gap: 12 },
  rowIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  rowTitle: { fontSize: 14, fontWeight: "800", color: Colors.textPrimary },
  rowDate: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  rowAmount: { fontSize: 15, fontWeight: "800", color: Colors.textPrimary },
  statusPill: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: Radii.pill },
  statusPillText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.5 },

  actionRow: { flexDirection: "row", gap: 8, marginTop: 10, flexWrap: "wrap" },
  actionBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radii.pill,
    minHeight: 36,
  },
  actionPay: { backgroundColor: Colors.success },
  actionPayText: { color: "#fff", fontWeight: "800", fontSize: 12 },
  actionReschedule: { backgroundColor: Colors.primarySoft, borderWidth: 1.2, borderColor: Colors.primary + "55" },
  actionRescheduleText: { color: Colors.primary, fontWeight: "800", fontSize: 12 },
  actionUndo: { backgroundColor: Colors.dangerSoft, borderWidth: 1.2, borderColor: Colors.danger + "55" },
  actionUndoText: { color: Colors.danger, fontWeight: "800", fontSize: 12 },

  lockedNotice: {
    flexDirection: "row", alignItems: "center", gap: 5,
    marginTop: 8, paddingHorizontal: 8, paddingVertical: 6,
    backgroundColor: Colors.bgAlt, borderRadius: Radii.md, alignSelf: "flex-start",
  },
  lockedText: { fontSize: 11, color: Colors.textMuted, fontWeight: "700" },

  modalBackdrop: { flex: 1, backgroundColor: "#00000099", justifyContent: "flex-end" },
  modalSheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: Spacing.lg, paddingBottom: Spacing.xxl,
  },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.border, alignSelf: "center", marginBottom: Spacing.md },
  modalTitle: { fontSize: 20, fontWeight: "800", color: Colors.textPrimary },
  modalSub: { color: Colors.textSecondary, marginTop: 4, fontSize: 13 },
  dateStepper: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: Colors.bgAlt, borderRadius: Radii.md, padding: 10, marginTop: 6 },
  stepBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: Colors.surface },
  dateValue: { fontSize: 18, fontWeight: "800", color: Colors.textPrimary, flex: 1, textAlign: "center" },
  quickRow: { flexDirection: "row", gap: 8, marginTop: 10, flexWrap: "wrap" },
  quickChip: { paddingHorizontal: 12, paddingVertical: 7, backgroundColor: Colors.primary + "15", borderRadius: Radii.pill },
  quickText: { color: Colors.primary, fontWeight: "700", fontSize: 12 },
  warnBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: Colors.dangerSoft, borderRadius: Radii.md, padding: Spacing.md, marginTop: Spacing.md, borderWidth: 1, borderColor: Colors.danger + "33" },
  warnText: { flex: 1, color: Colors.textPrimary, fontSize: 13, lineHeight: 18 },
  okBox: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: Colors.successSoft, borderRadius: Radii.md, padding: Spacing.md, marginTop: Spacing.md },
  okText: { color: Colors.textPrimary, fontSize: 13, fontWeight: "600" },
});
