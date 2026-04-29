import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Card, PrimaryButton } from "../../src/ui";
import { Colors, Radii, Shadows, Spacing } from "../../src/theme";
import { api } from "../../src/api";
import { downloadPdf } from "../../src/pdf";
import { useThemedStyles } from "../../src/themeContext";

type AuditResp = {
  period: { from: string; to: string; months: number };
  inflow_total: number;
  outflow_total: number;
  net: number;
  overdue_total: number;
  funded_count: number;
  repaid_count: number;
  monthly: { label: string; inflow: number; outflow: number; net: number }[];
  loans_funded: number;
  active_loans: number;
  reconciliation?: {
    opening_balance: number; inflow: number; outflow: number;
    closing_balance: number; formula: string; reconciled: boolean;
  };
  variance?: { severity: string; type: string; detail: string }[];
  inflow_transactions?: { date: string; counterparty: string; amount: number; mode: string; frequency: string; reference?: string }[];
  outflow_transactions?: { date: string; counterparty: string; amount: number; mode: string; category: string; reference?: string }[];
};

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export default function AuditScreen() {
  const styles = useScreenStyles();
  const router = useRouter();
  const now = new Date();
  const [mode, setMode] = useState<"3m" | "6m" | "12m" | "ytd">("3m");
  const [data, setData] = useState<AuditResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [year, setYear] = useState<number>(now.getFullYear());

  const monthsForMode = useMemo(() => ({ "3m": 3, "6m": 6, "12m": 12, ytd: now.getMonth() + 1 }[mode]), [mode]);

  const run = async () => {
    setLoading(true);
    try {
      const r = await api<AuditResp>(`/audit/summary?months=${monthsForMode}&year=${year}`);
      setData(r);
    } catch (e: any) {
      Alert.alert("Audit failed", e.message || "Could not fetch audit data.");
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => { run(); /* eslint-disable-next-line */ }, [mode, year]);

  const downloadAuditPdf = async () => {
    try {
      await downloadPdf(`/api/audit/summary.pdf?months=${monthsForMode}&year=${year}`, `audit_report_${mode}_${year}.pdf`);
    } catch (e: any) {
      Alert.alert("Download failed", e?.message || "Could not download audit PDF.");
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} testID="audit-back">
          <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Audit & Reports</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: Spacing.lg, paddingBottom: 80 }}>
        <Text style={styles.hint}>Inflow / outflow audit for your lending book. Pick a range.</Text>

        <View style={styles.segment}>
          {(["3m", "6m", "12m", "ytd"] as const).map((k) => (
            <TouchableOpacity
              key={k}
              testID={`audit-range-${k}`}
              style={[styles.segBtn, mode === k && styles.segBtnActive]}
              onPress={() => setMode(k)}
            >
              <Text style={[styles.segText, mode === k && styles.segTextActive]}>
                {k === "3m" ? "Last 3 mo" : k === "6m" ? "Last 6 mo" : k === "12m" ? "Last 12 mo" : "YTD"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.yearRow}>
          <Text style={styles.yearLabel}>Year</Text>
          <TouchableOpacity onPress={() => setYear((y) => y - 1)} style={styles.yrBtn}><Ionicons name="chevron-back" size={18} color={Colors.textPrimary} /></TouchableOpacity>
          <Text style={styles.yearValue}>{year}</Text>
          <TouchableOpacity onPress={() => setYear((y) => Math.min(now.getFullYear(), y + 1))} style={styles.yrBtn}><Ionicons name="chevron-forward" size={18} color={Colors.textPrimary} /></TouchableOpacity>
        </View>

        {loading && <ActivityIndicator size="small" color={Colors.primary} style={{ marginTop: 20 }} />}

        {data && (
          <>
            <Card style={{ marginTop: Spacing.md }}>
              <Text style={styles.sectionTitle}>Period summary</Text>
              <View style={styles.statGrid}>
                <StatTile label="Inflow (repayments)" value={`₹${data.inflow_total.toLocaleString("en-IN")}`} color={Colors.success} />
                <StatTile label="Outflow (disbursals)" value={`₹${data.outflow_total.toLocaleString("en-IN")}`} color={Colors.primary} />
                <StatTile label="Net position" value={`₹${data.net.toLocaleString("en-IN")}`} color={data.net >= 0 ? Colors.success : Colors.danger} />
                <StatTile label="Overdue outstanding" value={`₹${data.overdue_total.toLocaleString("en-IN")}`} color={Colors.danger} />
                <StatTile label="Loans funded" value={String(data.loans_funded)} />
                <StatTile label="Active loans" value={String(data.active_loans)} />
              </View>
            </Card>

            <Card style={{ marginTop: Spacing.md }}>
              <Text style={styles.sectionTitle}>Month-wise cashflow</Text>
              <View style={styles.tblHead}>
                <Text style={[styles.col, styles.colMonth]}>Month</Text>
                <Text style={[styles.col, styles.colAmt]}>Inflow</Text>
                <Text style={[styles.col, styles.colAmt]}>Outflow</Text>
                <Text style={[styles.col, styles.colAmt]}>Net</Text>
              </View>
              {data.monthly.map((m, i) => (
                <View key={i} style={styles.tblRow}>
                  <Text style={[styles.col, styles.colMonth]}>{m.label}</Text>
                  <Text style={[styles.col, styles.colAmt, { color: Colors.success }]}>+₹{m.inflow.toLocaleString("en-IN")}</Text>
                  <Text style={[styles.col, styles.colAmt, { color: Colors.primary }]}>-₹{m.outflow.toLocaleString("en-IN")}</Text>
                  <Text style={[styles.col, styles.colAmt, { fontWeight: "800", color: m.net >= 0 ? Colors.success : Colors.danger }]}>{m.net >= 0 ? "+" : "-"}₹{Math.abs(m.net).toLocaleString("en-IN")}</Text>
                </View>
              ))}
            </Card>

            {/* Reconciliation, Variance, and full transaction ledger are
                intentionally NOT rendered on the screen. They live ONLY in the
                downloadable Audit PDF for a clean, fast approval UX. */}
            <View style={styles.pdfHint}>
              <Ionicons name="document-lock" size={16} color={Colors.primary} />
              <Text style={styles.pdfHintTxt}>
                Full reconciliation, variance & exception ledger are available in the downloadable Audit PDF.
              </Text>
            </View>

            <View style={{ marginTop: Spacing.lg }}>
              <PrimaryButton testID="audit-download" title="Download audit report (PDF)" onPress={downloadAuditPdf} />
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function StatTile({ label, value, color }: { label: string; value: string; color?: string }) {
  const styles = useScreenStyles();
  return (
    <View style={styles.tile}>
      <Text style={styles.tileLbl}>{label}</Text>
      <Text style={[styles.tileVal, color ? { color } : {}]}>{value}</Text>
    </View>
  );
}

function useScreenStyles() {
  return useThemedStyles(() => StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  topBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  backBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.surface, alignItems: "center", justifyContent: "center", ...Shadows.card },
  title: { flex: 1, textAlign: "center", fontSize: 18, fontWeight: "800", color: Colors.textPrimary },
  hint: { color: Colors.textSecondary, fontSize: 13, marginBottom: Spacing.md },
  segment: { flexDirection: "row", gap: 6, marginBottom: 10 },
  segBtn: { flex: 1, paddingVertical: 10, borderRadius: Radii.md, backgroundColor: Colors.bgAlt, alignItems: "center", borderWidth: 1, borderColor: Colors.borderLight },
  segBtnActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  segText: { fontWeight: "700", color: Colors.textSecondary, fontSize: 12 },
  segTextActive: { color: "#fff" },
  yearRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 10, backgroundColor: Colors.surface, borderRadius: Radii.md, borderWidth: 1, borderColor: Colors.borderLight },
  yearLabel: { fontWeight: "700", color: Colors.textSecondary, flex: 1 },
  yrBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.bgAlt, alignItems: "center", justifyContent: "center" },
  yearValue: { fontSize: 16, fontWeight: "800", color: Colors.textPrimary, minWidth: 52, textAlign: "center" },
  sectionTitle: { fontSize: 14, fontWeight: "800", color: Colors.textPrimary, marginBottom: 10, letterSpacing: 0.3 },
  statGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tile: { width: "48%", backgroundColor: Colors.bgAlt, padding: 10, borderRadius: Radii.md },
  tileLbl: { fontSize: 11, fontWeight: "700", color: Colors.textMuted, letterSpacing: 0.4 },
  tileVal: { fontSize: 14, fontWeight: "800", color: Colors.textPrimary, marginTop: 4 },
  tblHead: { flexDirection: "row", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  tblRow: { flexDirection: "row", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#F1F5F9" },
  col: { fontSize: 12 },
  colMonth: { flex: 1, fontWeight: "700", color: Colors.textPrimary },
  colAmt: { width: 96, textAlign: "right", color: Colors.textSecondary },
  pdfHint: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: Colors.primary + "10", borderWidth: 1, borderColor: Colors.primary + "33",
    borderRadius: Radii.md, padding: 12, marginTop: Spacing.md,
  },
  pdfHintTxt: { flex: 1, color: Colors.textSecondary, fontSize: 12, lineHeight: 18 },
  }));
}

