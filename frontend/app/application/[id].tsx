import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator, Modal } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../src/api";
import { Card, InitialsAvatar, Input, PrimaryButton } from "../../src/ui";
import { Colors, Radii, Shadows, Spacing } from "../../src/theme";

type Client = {
  client_id: string;
  name: string;
  mobile?: string;
  pan?: string;
  aadhaar?: string;
};

type App = {
  application_id: string;
  client_id?: string;
  borrower: {
    name: string; avatar?: string; age: number; occupation: string;
    monthly_income: number; employment_years: number; existing_debts: number;
    credit_history_years: number; previous_defaults: number;
  };
  amount: number; purpose: string; term_months: number; interest_rate: number;
  status: string;
  loan_id?: string;
  created_at?: string; requested_at?: string;
  decided_at?: string; decided_by?: string; decided_by_name?: string; decision_reason?: string;
  approved_amount?: number; approved_tenure?: number; approved_rate?: number;
  risk_factors_at_decision?: string[];
  ai_score?: number; ai_risk?: string; ai_recommendation?: string;
};

const riskHex = (c?: string) =>
  c === "green" ? Colors.success : c === "yellow" ? Colors.secondary : c === "red" ? Colors.danger : Colors.textMuted;

const bandHex = (c?: string) =>
  c === "blue" ? "#2196F3" : c === "green" ? Colors.success : c === "yellow" ? Colors.secondary : c === "red" ? Colors.danger : Colors.textMuted;

function maskPan(pan?: string) {
  if (!pan || pan.length < 10) return pan || "—";
  return pan.slice(0, 3) + "XXXX" + pan.slice(-2);
}

export default function ApplicationSummary() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [app, setApp] = useState<App | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [actioning, setActioning] = useState<"" | "approve" | "reject" | "fund">("");
  const [cached, setCached] = useState<{ statement_analysis: any; cibil_report: any } | null>(null);

  // Reject modal state
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const load = useCallback(async () => {
    try {
      const d = await api<App>(`/applications/${id}`);
      setApp(d);
      if (d.client_id) {
        try {
          const c = await api<Client>(`/clients/${d.client_id}`);
          setClient(c);
        } catch (_) { /* client fetch optional */ }
        try {
          const la = await api<any>(`/clients/${d.client_id}/latest-analyses`);
          setCached({ statement_analysis: la.statement_analysis, cibil_report: la.cibil_report });
        } catch (_) { /* no cached analyses */ }
      }
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const runAction = async (endpoint: "approve" | "reject" | "fund", key: "approve" | "reject" | "fund", extraBody?: any) => {
    setActioning(key);
    try {
      await api(`/applications/${id}/${endpoint}`, { method: "POST", body: extraBody });
      if (endpoint === "fund") {
        Alert.alert("Loan funded", "The loan has been disbursed.");
        router.replace("/(tabs)/loans");
      } else {
        await load();
      }
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setActioning("");
    }
  };

  const confirmReject = async () => {
    if (!rejectReason.trim()) {
      Alert.alert("Reason required", "Please add a short reason for rejection.");
      return;
    }
    setRejectOpen(false);
    await runAction("reject", "reject", { reason: rejectReason.trim() });
    setRejectReason("");
  };

  if (loading || !app) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} testID="back-btn">
            <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.topTitle}>Application Summary</Text>
          <View style={{ width: 44 }} />
        </View>
        <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 80 }} />
      </SafeAreaView>
    );
  }

  // Loan maths
  const P = Number(app.amount) || 0;
  const n = Math.max(1, Number(app.term_months) || 1);
  const rMonthly = (Number(app.interest_rate) || 0) / 1200;
  const emi = rMonthly > 0
    ? Math.round((P * rMonthly * Math.pow(1 + rMonthly, n)) / (Math.pow(1 + rMonthly, n) - 1))
    : Math.round(P / n);
  const processingFee = Math.round(P * 0.015);
  const netDisbursal = Math.max(0, P - processingFee);
  const dueDateStr = "5th of every month";

  const analysis = cached?.statement_analysis;
  const cibil = cached?.cibil_report;

  // Combined overall risk (same formula as New Loan summary)
  let overallScore = 50;
  if (analysis) overallScore += analysis.risk_color === "green" ? 20 : analysis.risk_color === "yellow" ? 0 : -20;
  if (cibil) overallScore += (cibil.score - 650) / 10;
  overallScore = Math.max(0, Math.min(100, Math.round(overallScore)));
  const overallLabel = overallScore >= 70 ? "LOW RISK" : overallScore >= 45 ? "MODERATE" : "HIGH RISK";
  const overallColor = overallScore >= 70 ? Colors.success : overallScore >= 45 ? Colors.secondary : Colors.danger;

  const isDecided = app.status === "approved" || app.status === "rejected" || app.status === "funded";
  const showActions = app.status === "pending";
  const showFund = app.status === "approved" && !app.loan_id;
  const showLoanTrack = app.status === "funded" && !!app.loan_id;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} testID="back-btn">
          <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.topTitle}>Application Summary</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: Spacing.lg,
          // extra bottom padding = safe-area inset + action bar height + breathing room
          paddingBottom: Math.max(insets.bottom, 12) + (showActions ? 96 : showFund || showLoanTrack ? 110 : 24),
        }}
      >
        <Text style={styles.h1}>Application summary</Text>
        <Text style={styles.h1Sub}>
          {showLoanTrack
            ? "Loan is active. Track EMIs, mark payments & reschedule below."
            : showFund
              ? "Approved. Fund the loan to disburse and start the schedule."
              : isDecided
                ? "Decision recorded. Review the audit stamp below."
                : "Review risk & confirm to create the loan."}
        </Text>

        {/* Decision audit stamp (read-only) */}
        {isDecided && app.decided_at && (
          <View style={[styles.stampCard, { borderColor: app.status === "rejected" ? Colors.danger : Colors.success }]}>
            <View style={styles.stampHead}>
              <Ionicons
                name={app.status === "rejected" ? "close-circle" : "checkmark-circle"}
                size={18}
                color={app.status === "rejected" ? Colors.danger : Colors.success}
              />
              <Text style={[styles.stampTitle, { color: app.status === "rejected" ? Colors.danger : Colors.success }]}>
                {app.status === "rejected" ? "Loan Rejected" : (app.status === "funded" ? "Loan Funded" : "Loan Approved")}
              </Text>
              <Text style={styles.stampTs}>{new Date(app.decided_at).toLocaleDateString()}</Text>
            </View>
            <View style={styles.stampGrid}>
              <KVItem k="Decision by" v={app.decided_by_name || "Lender"} />
              <KVItem k="Status" v={app.status.toUpperCase()} color={app.status === "rejected" ? Colors.danger : Colors.success} />
            </View>
            {app.decision_reason ? (
              <View style={styles.stampReason}>
                <Text style={styles.stampReasonLbl}>{app.status === "rejected" ? "Rejection reason" : "Approval reason"}</Text>
                <Text style={styles.stampReasonTxt}>{app.decision_reason}</Text>
              </View>
            ) : null}
          </View>
        )}

        {/* Client header card */}
        <Card style={{ marginTop: Spacing.md }}>
          <View style={styles.clientRow}>
            <InitialsAvatar name={(client?.name || app.borrower.name)} size={48} />
            <View style={{ flex: 1 }}>
              <Text style={styles.clientName}>{client?.name || app.borrower.name}</Text>
              <Text style={styles.clientSub}>
                {client?.mobile ? `+91 ${client.mobile}` : "—"}
                {" · "}
                {maskPan(client?.pan)}
              </Text>
            </View>
          </View>
        </Card>

        {/* Bank Statement risk card */}
        {analysis ? (
          <View style={[styles.riskCard, { backgroundColor: riskHex(analysis.risk_color) + "12", borderColor: riskHex(analysis.risk_color) }]}>
            <View style={[styles.riskDot, { backgroundColor: riskHex(analysis.risk_color) }]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.riskLabel}>BANK STATEMENT</Text>
              <Text style={[styles.riskValue, { color: riskHex(analysis.risk_color) }]}>{String(analysis.bounce_risk || "—").toUpperCase()} RISK</Text>
              <Text style={styles.riskSub}>
                {(analysis.bounced_transactions ?? 0)} bounces · Avg ₹{(analysis.avg_balance ?? 0).toLocaleString("en-IN")}
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.placeholderCard}>
            <Ionicons name="document-text-outline" size={18} color={Colors.textMuted} />
            <Text style={styles.placeholderTxt}>No bank statement uploaded yet.</Text>
          </View>
        )}

        {/* CIBIL score card */}
        {cibil ? (
          <TouchableOpacity
            testID="open-cibil-report"
            activeOpacity={0.9}
            onPress={() => app.client_id && router.push(`/cibil-report/${app.client_id}` as any)}
            style={[styles.riskCard, { backgroundColor: bandHex(cibil.band_color) + "12", borderColor: bandHex(cibil.band_color) }]}
          >
            <View style={[styles.riskDot, { backgroundColor: bandHex(cibil.band_color) }]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.riskLabel}>CIBIL SCORE · TAP TO VIEW REPORT</Text>
              <Text style={[styles.riskValue, { color: bandHex(cibil.band_color) }]}>{cibil.score} · {String(cibil.band || "—").toUpperCase()}</Text>
              <Text style={styles.riskSub}>On-time {cibil.on_time_payments_pct || 0}% · Utilization {cibil.credit_utilization_pct || 0}%</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={bandHex(cibil.band_color)} />
          </TouchableOpacity>
        ) : (
          <View style={styles.placeholderCard}>
            <Ionicons name="shield-outline" size={18} color={Colors.textMuted} />
            <Text style={styles.placeholderTxt}>CIBIL not yet pulled.</Text>
          </View>
        )}

        {/* Overall Client Risk */}
        <Card style={{ marginTop: Spacing.md }}>
          <Text style={styles.sectionTitle}>Overall client risk</Text>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 10 }}>
            <Text style={{ fontSize: 40, fontWeight: "800", color: overallColor, letterSpacing: -1 }}>{overallScore}</Text>
            <Text style={{ color: Colors.textMuted, fontSize: 13 }}>/ 100</Text>
            <View style={{ flex: 1 }} />
            <View style={{ paddingHorizontal: 12, paddingVertical: 5, borderRadius: Radii.pill, backgroundColor: overallColor + "1A" }}>
              <Text style={{ color: overallColor, fontWeight: "800", fontSize: 12 }}>{overallLabel}</Text>
            </View>
          </View>
          <View style={{ height: 10, backgroundColor: Colors.bgAlt, borderRadius: 8, marginTop: 10, overflow: "hidden" }}>
            <View style={{ width: `${overallScore}%`, height: "100%", backgroundColor: overallColor }} />
          </View>
          <Text style={{ color: Colors.textSecondary, fontSize: 13, marginTop: 10, lineHeight: 20 }}>
            Combined assessment of bank-statement bounce risk and CIBIL credit discipline. Green = confident lend, Amber = review, Red = caution.
          </Text>
        </Card>

        {/* Loan summary numbers */}
        <Card style={{ marginTop: Spacing.md }}>
          <Text style={styles.sectionTitle}>Loan summary</Text>
          <Text style={styles.summaryAmount}>₹{P.toLocaleString("en-IN")}</Text>
          <Text style={styles.summaryPurpose}>{app.purpose} · {n} months · {app.interest_rate}% p.a.</Text>
          <View style={styles.summaryGrid}>
            <SumItem label="Monthly EMI" value={`₹${emi.toLocaleString("en-IN")}`} highlight />
            <SumItem label="Tenure" value={`${n} months`} />
            <SumItem label="Interest rate" value={`${app.interest_rate}% p.a.`} />
            <SumItem label="Due date" value={dueDateStr} />
            <SumItem label="Processing fee" value={`₹${processingFee.toLocaleString("en-IN")}`} />
            <SumItem label="Net disbursal" value={`₹${netDisbursal.toLocaleString("en-IN")}`} />
          </View>
        </Card>
      </ScrollView>

      {/* Action bar (sticky footer) */}
      {(showActions || showFund || showLoanTrack) && (
        <View style={[styles.actionBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          {showActions && (
            <View style={{ flexDirection: "row", gap: Spacing.sm }}>
              <View style={{ flex: 1 }}>
                <PrimaryButton
                  testID="reject-btn"
                  title="Reject"
                  variant="danger"
                  loading={actioning === "reject"}
                  disabled={actioning !== ""}
                  onPress={() => setRejectOpen(true)}
                />
              </View>
              <View style={{ flex: 1 }}>
                <PrimaryButton
                  testID="approve-btn"
                  title="Approve"
                  variant="success"
                  loading={actioning === "approve"}
                  disabled={actioning !== ""}
                  onPress={() => runAction("approve", "approve")}
                />
              </View>
            </View>
          )}
          {showFund && (
            <PrimaryButton
              testID="fund-btn"
              title={`Fund ₹${P.toLocaleString("en-IN")}`}
              loading={actioning === "fund"}
              disabled={actioning !== ""}
              onPress={() => runAction("fund", "fund")}
            />
          )}
          {showLoanTrack && (
            <TouchableOpacity
              testID="loan-track-btn"
              onPress={() => app.loan_id && router.push({ pathname: "/loan/[id]", params: { id: app.loan_id } })}
              activeOpacity={0.88}
              style={styles.trackBtn}
            >
              <Ionicons name="trending-up" size={16} color="#fff" />
              <Text style={styles.trackBtnTitle}>Loan Track</Text>
              <Ionicons name="arrow-forward" size={16} color="#fff" style={{ marginLeft: "auto" }} />
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Reject reason modal */}
      <Modal visible={rejectOpen} transparent animationType="slide" onRequestClose={() => setRejectOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <Text style={{ fontSize: 18, fontWeight: "800", color: Colors.textPrimary }}>Reject application</Text>
            <Text style={{ color: Colors.textSecondary, marginTop: 6, marginBottom: Spacing.md }}>Add a short reason for the audit trail.</Text>
            <Input
              testID="reject-reason"
              placeholder="e.g. High bounce risk, low CIBIL"
              value={rejectReason}
              onChangeText={setRejectReason}
              multiline
              numberOfLines={3}
              style={{ height: 90, textAlignVertical: "top", paddingTop: 12 }}
            />
            <View style={{ height: Spacing.md }} />
            <PrimaryButton testID="confirm-reject" title="Confirm rejection" variant="danger" loading={actioning === "reject"} onPress={confirmReject} />
            <View style={{ height: Spacing.sm }} />
            <PrimaryButton title="Cancel" variant="secondary" onPress={() => setRejectOpen(false)} />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function SumItem({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <View style={[styles.sumItem, highlight && styles.sumItemHi]}>
      <Text style={styles.sumLabel}>{label}</Text>
      <Text style={[styles.sumValue, highlight && { color: Colors.primary, fontSize: 16 }]}>{value}</Text>
    </View>
  );
}

function KVItem({ k, v, color }: { k: string; v: string; color?: string }) {
  return (
    <View style={styles.kv}>
      <Text style={styles.kvKey}>{k}</Text>
      <Text style={[styles.kvVal, color ? { color } : {}]}>{v}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  topBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  backBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.surface, alignItems: "center", justifyContent: "center", ...Shadows.card },
  topTitle: { flex: 1, textAlign: "center", fontSize: 18, fontWeight: "800", color: Colors.textPrimary },

  h1: { fontSize: 22, fontWeight: "800", color: Colors.textPrimary, letterSpacing: -0.3 },
  h1Sub: { color: Colors.textSecondary, fontSize: 13, marginTop: 4, marginBottom: Spacing.sm },

  clientRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  clientName: { fontSize: 17, fontWeight: "800", color: Colors.textPrimary },
  clientSub: { color: Colors.textSecondary, fontSize: 13, marginTop: 2 },

  riskCard: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: "#F8FAFC",
    borderWidth: 1, borderColor: Colors.borderLight,
    borderRadius: Radii.xl, padding: Spacing.md, marginTop: Spacing.md,
  },
  riskDot: { width: 10, height: 10, borderRadius: 5 },
  riskLabel: { fontSize: 10, fontWeight: "800", letterSpacing: 0.6, color: Colors.textMuted },
  riskValue: { fontSize: 20, fontWeight: "800", marginTop: 3, letterSpacing: -0.3 },
  riskSub: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },

  placeholderCard: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.borderLight,
    borderRadius: Radii.xl, padding: Spacing.md, marginTop: Spacing.md,
  },
  placeholderTxt: { color: Colors.textSecondary, fontSize: 13 },

  sectionTitle: { fontSize: 14, fontWeight: "800", color: Colors.textPrimary, marginBottom: 10, letterSpacing: 0.3 },

  summaryAmount: { fontSize: 32, fontWeight: "800", color: Colors.textPrimary, letterSpacing: -0.5 },
  summaryPurpose: { color: Colors.textSecondary, fontSize: 12, marginTop: 2, fontWeight: "600" },
  summaryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: Spacing.md },
  sumItem: {
    width: "48%", backgroundColor: Colors.bgAlt, borderRadius: Radii.lg,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  sumItemHi: { backgroundColor: Colors.primary + "12", borderWidth: 1, borderColor: Colors.primary + "2A" },
  sumLabel: { fontSize: 11, color: Colors.textMuted, fontWeight: "700", letterSpacing: 0.4 },
  sumValue: { fontSize: 15, fontWeight: "800", color: Colors.textPrimary, marginTop: 2 },

  // Audit stamp
  stampCard: {
    backgroundColor: Colors.surface, borderRadius: Radii.xl, padding: Spacing.lg,
    marginTop: Spacing.sm, borderWidth: 2, ...Shadows.card,
  },
  stampHead: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  stampTitle: { flex: 1, fontSize: 15, fontWeight: "800", letterSpacing: 0.3 },
  stampTs: { fontSize: 11, color: Colors.textMuted, fontWeight: "600" },
  stampGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  kv: { width: "48%", backgroundColor: Colors.bgAlt, padding: 10, borderRadius: Radii.md },
  kvKey: { fontSize: 11, color: Colors.textMuted, fontWeight: "700", letterSpacing: 0.4 },
  kvVal: { fontSize: 14, fontWeight: "800", color: Colors.textPrimary, marginTop: 3 },
  stampReason: { marginTop: Spacing.md, paddingTop: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.borderLight },
  stampReasonLbl: { fontSize: 11, color: Colors.textMuted, fontWeight: "800", letterSpacing: 0.5 },
  stampReasonTxt: { fontSize: 13, color: Colors.textPrimary, marginTop: 4, lineHeight: 19 },

  actionBar: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    backgroundColor: Colors.surface, paddingHorizontal: Spacing.md, paddingTop: 10,
    borderTopWidth: 1, borderTopColor: Colors.borderLight,
  },

  // Compact Loan Track CTA — respects system nav safe area via actionBar padding
  trackBtn: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: Colors.primary, borderRadius: Radii.lg,
    paddingVertical: 12, paddingHorizontal: 16, minHeight: 48, ...Shadows.button,
  },
  trackBtnTitle: { color: "#fff", fontWeight: "800", fontSize: 14.5, letterSpacing: 0.3 },

  modalBackdrop: { flex: 1, backgroundColor: "rgba(15,23,42,0.55)", justifyContent: "flex-end" },
  modalSheet: { backgroundColor: Colors.surface, padding: Spacing.lg, borderTopLeftRadius: Radii.xl, borderTopRightRadius: Radii.xl },
});
