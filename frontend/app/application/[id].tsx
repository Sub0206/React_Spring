import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../src/api";
import { Badge, Card, PrimaryButton } from "../../src/ui";
import { Colors, Radii, Shadows, Spacing } from "../../src/theme";

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
  created_at?: string; requested_at?: string;
  ai_score?: number; ai_risk?: string; ai_recommendation?: string; ai_reasoning?: string;
  ai_factors?: { label: string; impact: string; detail: string }[];
};

function riskInfo(risk?: string) {
  if (risk === "low") return { color: Colors.success, bg: Colors.success + "1A", label: "LOW RISK" };
  if (risk === "medium") return { color: Colors.secondary, bg: Colors.secondary + "1A", label: "MEDIUM RISK" };
  if (risk === "high") return { color: Colors.danger, bg: Colors.danger + "1A", label: "HIGH RISK" };
  return { color: Colors.textMuted, bg: Colors.bgAlt, label: "UNSCORED" };
}

export default function ApplicationDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [app, setApp] = useState<App | null>(null);
  const [loading, setLoading] = useState(true);
  const [actioning, setActioning] = useState<"" | "approve" | "reject" | "fund" | "rescore">("");

  const load = useCallback(async () => {
    try {
      const d = await api<App>(`/applications/${id}`);
      setApp(d);
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const runAction = async (endpoint: "approve" | "reject" | "fund", key: "approve" | "reject" | "fund") => {
    setActioning(key);
    try {
      await api(`/applications/${id}/${endpoint}`, { method: "POST" });
      Alert.alert("Success", `Loan ${endpoint}d`);
      if (endpoint === "fund") {
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

  const rescore = async () => {
    setActioning("rescore");
    try {
      const d = await api<App>(`/applications/${id}/score`, { method: "POST" });
      setApp(d);
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setActioning("");
    }
  };

  if (loading || !app) {
    return (
      <SafeAreaView style={styles.safe}>
        <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 80 }} />
      </SafeAreaView>
    );
  }

  const r = riskInfo(app.ai_risk);
  const b = app.borrower;
  const dti = ((b.existing_debts / Math.max(b.monthly_income, 1)) * 100).toFixed(0);
  // Loan maths
  const P = Number(app.amount) || 0;
  const n = Math.max(1, Number(app.term_months) || 1);
  const rMonthly = (Number(app.interest_rate) || 0) / 1200;
  const emi = rMonthly > 0
    ? Math.round((P * rMonthly * Math.pow(1 + rMonthly, n)) / (Math.pow(1 + rMonthly, n) - 1))
    : Math.round(P / n);
  const processingFee = Math.round(P * 0.015); // 1.5% standard processing fee
  const netDisbursal = Math.max(0, P - processingFee);
  // Requested date — prefer created_at then requested_at, else today
  const reqDate = app.created_at || app.requested_at || new Date().toISOString();
  const reqDateStr = new Date(reqDate).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
  // Monthly due date — 5th of every month by convention (matches app default)
  const dueDateStr = "5th of every month";
  const shortId = (app.application_id || "").replace(/^app_?/, "").slice(0, 10).toUpperCase();
  const recoBy = app.ai_recommendation || (app.ai_risk === "low" ? "Approve" : app.ai_risk === "high" ? "Manual Review" : "Approve with Caution");

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.topBar}>
        <TouchableOpacity testID="back-btn" onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.topTitle}>Loan Request</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: Spacing.lg, paddingBottom: 160 }}>
        {/* Clean text-only client header */}
        <View style={styles.clientHeader}>
          <Text style={styles.clientName}>{b.name}</Text>
          <View style={styles.clientMetaRow}>
            <Text style={styles.clientMeta}>ID #{shortId}</Text>
            <View style={styles.dotSep} />
            <Text style={styles.clientMeta}>Requested {reqDateStr}</Text>
          </View>
          <View style={{ flexDirection: "row", gap: 6, marginTop: 8 }}>
            <Badge label={app.status.toUpperCase()} color={app.status === "pending" ? Colors.secondary : app.status === "funded" ? Colors.success : Colors.primary} />
          </View>
        </View>

        {/* Premium loan summary */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryHeaderRow}>
            <Text style={styles.summaryHeaderTitle}>LOAN SUMMARY</Text>
            <View style={[styles.riskChip, { backgroundColor: r.bg, borderColor: r.color + "55" }]}>
              <View style={[styles.riskDot, { backgroundColor: r.color }]} />
              <Text style={[styles.riskChipText, { color: r.color }]}>{r.label}</Text>
            </View>
          </View>
          <Text testID="loan-amount" style={styles.summaryAmount}>₹{P.toLocaleString("en-IN")}</Text>
          <Text style={styles.summaryPurpose}>{app.purpose} · {n} months · {app.interest_rate}% p.a.</Text>

          <View style={styles.summaryGrid}>
            <SumItem label="Monthly EMI" value={`₹${emi.toLocaleString("en-IN")}`} highlight />
            <SumItem label="Tenure" value={`${n} months`} />
            <SumItem label="Interest rate" value={`${app.interest_rate}% p.a.`} />
            <SumItem label="Due date" value={dueDateStr} />
            <SumItem label="Processing fee" value={`₹${processingFee.toLocaleString("en-IN")}`} />
            <SumItem label="Net disbursal" value={`₹${netDisbursal.toLocaleString("en-IN")}`} />
          </View>

          <View style={styles.aiRecoRow}>
            <Ionicons name="sparkles" size={16} color={Colors.primary} />
            <Text style={styles.aiRecoLabel}>Recommended by AI</Text>
            <Text style={[styles.aiRecoValue, { color: r.color }]}>
              {String(recoBy).toUpperCase().replace(/_/g, " ")}
            </Text>
          </View>
        </View>

        {/* AI Credit Score */}
        <View style={styles.aiCard}>
          <View style={styles.aiHeader}>
            <View style={styles.aiIcon}>
              <Ionicons name="sparkles" size={18} color="#fff" />
            </View>
            <Text style={styles.aiTitle}>AI Credit Assessment</Text>
            <TouchableOpacity testID="rescore-btn" onPress={rescore} disabled={actioning !== ""} style={styles.rescoreBtn}>
              {actioning === "rescore" ? <ActivityIndicator color={Colors.primary} size="small" /> : <Ionicons name="refresh" size={16} color={Colors.primary} />}
            </TouchableOpacity>
          </View>

          <View style={styles.scoreRow}>
            <View style={styles.scoreCircle}>
              <Text testID="ai-score" style={styles.scoreNumber}>{app.ai_score ?? "—"}</Text>
              <Text style={styles.scoreMax}>/ 850</Text>
            </View>
            <View style={{ flex: 1, marginLeft: Spacing.md }}>
              <View style={[styles.riskPill, { backgroundColor: r.bg, borderColor: r.color + "33" }]}>
                <Text style={[styles.riskText, { color: r.color }]}>{r.label}</Text>
              </View>
              <Text style={styles.reasoning}>{app.ai_reasoning || "Tap refresh to generate AI assessment."}</Text>
            </View>
          </View>

          {app.ai_factors && app.ai_factors.length > 0 && (
            <View style={{ marginTop: Spacing.md }}>
              {app.ai_factors.map((f, i) => {
                const c = f.impact === "positive" ? Colors.success : f.impact === "negative" ? Colors.danger : Colors.textMuted;
                const icon = f.impact === "positive" ? "trending-up" : f.impact === "negative" ? "trending-down" : "remove";
                return (
                  <View key={i} style={styles.factorRow}>
                    <View style={[styles.factorIcon, { backgroundColor: c + "1A" }]}>
                      <Ionicons name={icon as any} size={14} color={c} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.factorLabel}>{f.label}</Text>
                      <Text style={styles.factorDetail}>{f.detail}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        {/* Borrower profile */}
        <Card style={{ marginTop: Spacing.md }}>
          <Text style={styles.sectionTitle}>Borrower profile</Text>
          <Row label="Monthly income" value={`$${b.monthly_income.toLocaleString()}`} />
          <Row label="Employment" value={`${b.employment_years} yrs`} />
          <Row label="Existing monthly debts" value={`$${b.existing_debts.toLocaleString()}`} />
          <Row label="Debt-to-income" value={`${dti}%`} />
          <Row label="Credit history" value={`${b.credit_history_years} yrs`} />
          <Row label="Prior defaults" value={b.previous_defaults.toString()} last />
        </Card>
      </ScrollView>

      {/* Action bar */}
      {(app.status === "pending" || app.status === "approved") && (
        <View style={styles.actionBar}>
          {app.status === "pending" && (
            <View style={{ flexDirection: "row", gap: Spacing.sm, marginBottom: Spacing.sm }}>
              <View style={{ flex: 1 }}>
                <PrimaryButton
                  testID="reject-btn"
                  title="Reject"
                  variant="secondary"
                  loading={actioning === "reject"}
                  disabled={actioning !== ""}
                  onPress={() => runAction("reject", "reject")}
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
          <PrimaryButton
            testID="fund-btn"
            title={`Fund $${app.amount.toLocaleString()}`}
            loading={actioning === "fund"}
            disabled={actioning !== ""}
            onPress={() => runAction("fund", "fund")}
          />
        </View>
      )}
    </SafeAreaView>
  );
}

function Row({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[rowStyles.row, !last && rowStyles.divider]}>
      <Text style={rowStyles.label}>{label}</Text>
      <Text style={rowStyles.value}>{value}</Text>
    </View>
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

const rowStyles = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 12 },
  divider: { borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  label: { color: Colors.textSecondary, fontSize: 14 },
  value: { color: Colors.textPrimary, fontSize: 15, fontWeight: "700" },
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  topBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  backBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.surface, alignItems: "center", justifyContent: "center", ...Shadows.card },
  topTitle: { flex: 1, textAlign: "center", fontSize: 18, fontWeight: "800", color: Colors.textPrimary },
  borrowerHeader: { flexDirection: "row", alignItems: "center", gap: Spacing.md },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: Colors.bgAlt },

  clientHeader: { marginBottom: Spacing.md },
  clientName: { fontSize: 24, fontWeight: "800", color: Colors.textPrimary, letterSpacing: -0.3 },
  clientMetaRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 },
  clientMeta: { color: Colors.textSecondary, fontSize: 13, fontWeight: "600" },
  dotSep: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: Colors.textMuted },

  summaryCard: {
    backgroundColor: Colors.surface, borderRadius: Radii.xl, padding: Spacing.lg,
    marginBottom: Spacing.md, borderWidth: 1, borderColor: Colors.borderLight,
    ...Shadows.card,
  },
  summaryHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  summaryHeaderTitle: { fontSize: 11, fontWeight: "800", color: Colors.textMuted, letterSpacing: 1 },
  riskChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radii.pill, borderWidth: 1 },
  riskDot: { width: 8, height: 8, borderRadius: 4 },
  riskChipText: { fontWeight: "800", fontSize: 11, letterSpacing: 0.3 },
  summaryAmount: { fontSize: 36, fontWeight: "800", color: Colors.textPrimary, marginTop: 8, letterSpacing: -0.7 },
  summaryPurpose: { color: Colors.textSecondary, fontSize: 13, marginTop: 2, fontWeight: "600" },

  summaryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: Spacing.md },
  sumItem: {
    width: "48%", backgroundColor: Colors.bgAlt, borderRadius: Radii.lg,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  sumItemHi: { backgroundColor: Colors.primarySoft ?? (Colors.primary + "12"), borderWidth: 1, borderColor: Colors.primary + "2A" },
  sumLabel: { fontSize: 11, color: Colors.textMuted, fontWeight: "700", letterSpacing: 0.4 },
  sumValue: { fontSize: 15, fontWeight: "800", color: Colors.textPrimary, marginTop: 2 },

  aiRecoRow: {
    flexDirection: "row", alignItems: "center", gap: 8, marginTop: Spacing.md,
    paddingTop: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.borderLight,
  },
  aiRecoLabel: { flex: 1, color: Colors.textSecondary, fontSize: 12, fontWeight: "700", letterSpacing: 0.3 },
  aiRecoValue: { fontSize: 13, fontWeight: "800" },
  name: { fontSize: 22, fontWeight: "800", color: Colors.textPrimary },
  meta: { color: Colors.textSecondary, fontSize: 14, marginTop: 2 },
  label: { fontSize: 11, color: Colors.textMuted, fontWeight: "700", letterSpacing: 0.5 },
  bigAmount: { fontSize: 36, fontWeight: "800", color: Colors.textPrimary, marginTop: 6, letterSpacing: -0.5 },
  metaRow: { flexDirection: "row", justifyContent: "space-between", marginTop: Spacing.md },
  value: { fontSize: 15, fontWeight: "700", color: Colors.textPrimary, marginTop: 2 },
  aiCard: {
    marginTop: Spacing.md, borderRadius: Radii.xl, padding: Spacing.lg,
    backgroundColor: "#ECFEFF", borderWidth: 1, borderColor: Colors.success + "33",
  },
  aiHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  aiIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: Colors.primary, alignItems: "center", justifyContent: "center" },
  aiTitle: { flex: 1, fontSize: 16, fontWeight: "800", color: Colors.textPrimary },
  rescoreBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: "#fff",
    alignItems: "center", justifyContent: "center", ...Shadows.card,
  },
  scoreRow: { flexDirection: "row", alignItems: "center", marginTop: Spacing.md },
  scoreCircle: {
    width: 110, height: 110, borderRadius: 55, backgroundColor: "#fff",
    alignItems: "center", justifyContent: "center", borderWidth: 4, borderColor: Colors.primary,
  },
  scoreNumber: { fontSize: 32, fontWeight: "800", color: Colors.primary },
  scoreMax: { fontSize: 11, color: Colors.textMuted, marginTop: -2 },
  riskPill: { alignSelf: "flex-start", paddingHorizontal: 12, paddingVertical: 5, borderRadius: Radii.pill, borderWidth: 1 },
  riskText: { fontWeight: "800", fontSize: 12 },
  reasoning: { color: Colors.textSecondary, fontSize: 13, marginTop: 8, lineHeight: 18 },
  factorRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: Colors.success + "22" },
  factorIcon: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  factorLabel: { fontSize: 14, fontWeight: "700", color: Colors.textPrimary },
  factorDetail: { fontSize: 12, color: Colors.textSecondary, marginTop: 1 },
  sectionTitle: { fontSize: 16, fontWeight: "800", color: Colors.textPrimary, marginBottom: 4 },
  actionBar: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    backgroundColor: Colors.surface, padding: Spacing.md, paddingBottom: Spacing.lg,
    borderTopWidth: 1, borderTopColor: Colors.borderLight,
  },
});
