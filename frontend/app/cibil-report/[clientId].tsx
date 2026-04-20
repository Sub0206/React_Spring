import React, { useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Circle, G, Path } from "react-native-svg";
import { Card, PrimaryButton } from "../../src/ui";
import { Colors, Radii, Spacing } from "../../src/theme";
import { downloadPdf } from "../../src/pdf";

type Cibil = {
  score: number;
  band: string;
  band_color: "red" | "yellow" | "green" | "blue" | string;
  on_time_payments_pct: number;
  credit_utilization_pct: number;
  total_accounts: number;
  active_loans: number;
  hard_enquiries_6m: number;
  factors?: { label: string; impact: "positive" | "negative" | "neutral" | string; detail: string }[];
  summary?: string;
  name?: string;
  pan?: string;
  created_at?: string;
};

const bandHex = (c?: string) =>
  c === "blue" ? "#2196F3" : c === "green" ? Colors.success : c === "yellow" ? Colors.secondary : c === "red" ? Colors.danger : Colors.textMuted;

const impactHex = (i?: string) =>
  i === "positive" ? Colors.success : i === "negative" ? Colors.danger : Colors.textSecondary;

const impactIcon = (i?: string): any =>
  i === "positive" ? "arrow-up-circle" : i === "negative" ? "arrow-down-circle" : "remove-circle";

export default function CibilReport() {
  const { clientId, data } = useLocalSearchParams<{ clientId: string; data?: string }>();
  const router = useRouter();

  const cibil: Cibil | null = useMemo(() => {
    if (!data) return null;
    try { return JSON.parse(String(data)); } catch { return null; }
  }, [data]);

  if (!cibil) {
    return (
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <View style={styles.topBar}>
          <TouchableOpacity testID="back-cibil" onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.topTitle}>CIBIL Report</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={{ padding: Spacing.lg, alignItems: "center", marginTop: Spacing.xxl }}>
          <Ionicons name="alert-circle" size={56} color={Colors.danger} />
          <Text style={{ marginTop: Spacing.md, color: Colors.textSecondary, fontSize: 15 }}>
            No CIBIL data available. Please run the CIBIL check first.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const color = bandHex(cibil.band_color);

  const downloadReport = async () => {
    try {
      const safe = (cibil.name || "report").replace(/\s+/g, "_");
      await downloadPdf(
        `/api/clients/${clientId}/cibil-report.pdf`,
        `cibil_analysis_report_${safe}.pdf`,
      );
    } catch (e: any) {
      Alert.alert("Download failed", e?.message || "Could not download CIBIL PDF.");
    }
  };

  // Gauge calculations (300–900 range)
  const min = 300, max = 900;
  const pct = Math.max(0, Math.min(1, (cibil.score - min) / (max - min)));
  const size = 220;
  const stroke = 18;
  const radius = (size - stroke) / 2;
  // Half circle arc: from angle 180° to 360° (bottom half sweep)
  const arcSweep = Math.PI; // 180° in radians
  // For a half-circle open at the bottom we actually want to sweep from 180 (left) to 0 (right) going over top
  // Using a semi-circle (upper half): start at (0, size/2), end at (size, size/2)
  const arcStart = { x: stroke / 2, y: size / 2 };
  const arcEnd = { x: size - stroke / 2, y: size / 2 };
  const describeArc = (frac: number) => {
    // angle from 180° to 0° going through 90° (top)
    const angle = Math.PI - frac * Math.PI; // π → 0
    const cx = size / 2;
    const cy = size / 2;
    const x = cx + radius * Math.cos(angle);
    const y = cy - radius * Math.sin(angle);
    const largeArc = frac > 0.5 ? 1 : 0;
    return `M ${arcStart.x} ${arcStart.y} A ${radius} ${radius} 0 ${largeArc} 1 ${x} ${y}`;
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={[styles.topBar, { backgroundColor: color }]}>
        <TouchableOpacity testID="back-cibil" onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.topTitle}>CIBIL Report</Text>
        <TouchableOpacity testID="download-cibil-top" onPress={downloadReport} style={styles.backBtn}>
          <Ionicons name="download" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: Spacing.lg, paddingBottom: 120 }}>
        {/* Score gauge */}
        <View style={[styles.gaugeCard, { borderColor: color + "55" }]}>
          <Text style={styles.gaugeTitle}>Credit Score</Text>
          <Text style={styles.gaugeSub}>{cibil.name || "Client"}{cibil.pan ? ` · ${cibil.pan}` : ""}</Text>

          <View style={{ alignItems: "center", marginTop: Spacing.md }}>
            <Svg width={size} height={size / 2 + 24}>
              <G>
                {/* Background arc */}
                <Path
                  d={describeArc(1)}
                  stroke={Colors.bgAlt}
                  strokeWidth={stroke}
                  fill="none"
                  strokeLinecap="round"
                />
                {/* Value arc */}
                <Path
                  d={describeArc(Math.max(0.02, pct))}
                  stroke={color}
                  strokeWidth={stroke}
                  fill="none"
                  strokeLinecap="round"
                />
              </G>
            </Svg>
            <View style={styles.scoreCenter}>
              <Text testID="cibil-score" style={[styles.scoreText, { color }]}>{cibil.score}</Text>
              <Text style={[styles.bandPill, { backgroundColor: color + "1A", color }]}>
                {String(cibil.band).toUpperCase()}
              </Text>
            </View>
          </View>

          <View style={styles.legendRow}>
            <LegendSeg label="Poor" from={300} to={579} color={Colors.danger} />
            <LegendSeg label="Fair" from={580} to={669} color={Colors.secondary} />
            <LegendSeg label="Good" from={670} to={749} color={Colors.success} />
            <LegendSeg label="Excellent" from={750} to={900} color="#2196F3" />
          </View>

          {!!cibil.summary && (
            <Text style={styles.summary}>{cibil.summary}</Text>
          )}
        </View>

        {/* Payment History + Utilization */}
        <View style={styles.dualRow}>
          <View style={[styles.dualCard, { borderTopColor: Colors.success }]}>
            <Ionicons name="checkmark-done-circle" size={22} color={Colors.success} />
            <Text style={styles.dualLabel}>PAYMENT HISTORY</Text>
            <Text style={[styles.dualValue, { color: Colors.success }]}>
              {cibil.on_time_payments_pct.toFixed(1)}%
            </Text>
            <Text style={styles.dualSub}>on-time payments</Text>
            <ProgressBar pct={cibil.on_time_payments_pct} color={Colors.success} />
          </View>
          <View style={[styles.dualCard, { borderTopColor: cibil.credit_utilization_pct > 60 ? Colors.danger : cibil.credit_utilization_pct > 30 ? Colors.secondary : Colors.primary }]}>
            <Ionicons name="pie-chart" size={22} color={cibil.credit_utilization_pct > 60 ? Colors.danger : Colors.primary} />
            <Text style={styles.dualLabel}>CREDIT UTILIZATION</Text>
            <Text style={[styles.dualValue, { color: cibil.credit_utilization_pct > 60 ? Colors.danger : cibil.credit_utilization_pct > 30 ? Colors.secondary : Colors.primary }]}>
              {cibil.credit_utilization_pct.toFixed(1)}%
            </Text>
            <Text style={styles.dualSub}>of total limit</Text>
            <ProgressBar pct={cibil.credit_utilization_pct} color={cibil.credit_utilization_pct > 60 ? Colors.danger : cibil.credit_utilization_pct > 30 ? Colors.secondary : Colors.primary} />
          </View>
        </View>

        {/* Account Summary */}
        <Card style={{ marginTop: Spacing.md }}>
          <View style={styles.rowHead}>
            <Ionicons name="briefcase" size={18} color={Colors.primary} />
            <Text style={styles.sectionTitle}>Account summary</Text>
          </View>
          <View style={styles.accRow}>
            <AccBox icon="albums" label="Total accounts" value={String(cibil.total_accounts)} color={Colors.primary} />
            <AccBox icon="cash" label="Active loans" value={String(cibil.active_loans)} color={Colors.info} />
            <AccBox icon="search-circle" label="Enquiries (6m)" value={String(cibil.hard_enquiries_6m)} color={cibil.hard_enquiries_6m > 3 ? Colors.danger : Colors.textSecondary} />
          </View>
        </Card>

        {/* Factors */}
        {!!(cibil.factors && cibil.factors.length) && (
          <Card style={{ marginTop: Spacing.md }}>
            <View style={styles.rowHead}>
              <Ionicons name="construct" size={18} color={Colors.primary} />
              <Text style={styles.sectionTitle}>Score factors</Text>
            </View>
            {cibil.factors!.map((f, i) => (
              <View
                key={i}
                testID={`factor-${i}`}
                style={[styles.factorItem, i < cibil.factors!.length - 1 && { borderBottomWidth: 1, borderBottomColor: Colors.borderLight }]}
              >
                <Ionicons name={impactIcon(f.impact)} size={22} color={impactHex(f.impact)} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.factorLabel}>{f.label}</Text>
                  <Text style={styles.factorDetail}>{f.detail}</Text>
                </View>
                <View style={[styles.impactPill, { backgroundColor: impactHex(f.impact) + "1A" }]}>
                  <Text style={{ color: impactHex(f.impact), fontSize: 10, fontWeight: "800", letterSpacing: 0.4 }}>
                    {String(f.impact).toUpperCase()}
                  </Text>
                </View>
              </View>
            ))}
          </Card>
        )}

        {/* CTA */}
        <View style={{ height: Spacing.lg }} />
        <PrimaryButton
          testID="cibil-continue"
          title="Continue to summary"
          onPress={() => router.back()}
        />
        <View style={{ height: Spacing.sm }} />
        <TouchableOpacity testID="download-cibil" onPress={downloadReport} style={styles.downloadBtn}>
          <Ionicons name="document-text" size={18} color={Colors.primary} />
          <Text style={styles.downloadText}>Download Report (PDF)</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function LegendSeg({ label, from, to, color }: { label: string; from: number; to: number; color: string }) {
  return (
    <View style={{ alignItems: "center", flex: 1 }}>
      <View style={{ height: 4, alignSelf: "stretch", backgroundColor: color, borderRadius: 2, marginHorizontal: 2 }} />
      <Text style={{ fontSize: 9, fontWeight: "700", color: Colors.textSecondary, marginTop: 4 }}>{label}</Text>
      <Text style={{ fontSize: 9, color: Colors.textMuted }}>{from}–{to}</Text>
    </View>
  );
}

function ProgressBar({ pct, color }: { pct: number; color: string }) {
  const v = Math.max(0, Math.min(100, pct));
  return (
    <View style={styles.barTrack}>
      <View style={[styles.barFill, { width: `${v}%`, backgroundColor: color }]} />
    </View>
  );
}

function AccBox({ icon, label, value, color }: { icon: any; label: string; value: string; color: string }) {
  return (
    <View style={styles.accBox}>
      <View style={[styles.accIcon, { backgroundColor: color + "1A" }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <Text style={[styles.accValue, { color }]}>{value}</Text>
      <Text style={styles.accLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  topBar: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    backgroundColor: Colors.info,
  },
  backBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  topTitle: { flex: 1, textAlign: "center", fontSize: 18, fontWeight: "800", color: "#fff" },

  gaugeCard: {
    backgroundColor: Colors.surface, borderRadius: Radii.xl,
    padding: Spacing.lg, borderWidth: 2,
  },
  gaugeTitle: { fontSize: 14, fontWeight: "800", color: Colors.textMuted, letterSpacing: 0.8 },
  gaugeSub: { color: Colors.textSecondary, fontSize: 13, marginTop: 4 },
  scoreCenter: { position: "absolute", top: 40, alignItems: "center", alignSelf: "center" },
  scoreText: { fontSize: 52, fontWeight: "800", letterSpacing: -2 },
  bandPill: {
    paddingHorizontal: 14, paddingVertical: 4, borderRadius: Radii.pill,
    fontSize: 12, fontWeight: "800", overflow: "hidden", letterSpacing: 1, marginTop: 2,
  },
  legendRow: { flexDirection: "row", gap: 4, marginTop: Spacing.md },
  summary: { color: Colors.textSecondary, fontSize: 13, marginTop: Spacing.md, lineHeight: 20 },

  dualRow: { flexDirection: "row", gap: Spacing.md, marginTop: Spacing.md },
  dualCard: {
    flex: 1, backgroundColor: Colors.surface, borderRadius: Radii.lg,
    padding: Spacing.md, borderTopWidth: 4,
  },
  dualLabel: { fontSize: 10, fontWeight: "800", color: Colors.textMuted, letterSpacing: 0.8, marginTop: 8 },
  dualValue: { fontSize: 26, fontWeight: "800", marginTop: 4, letterSpacing: -0.5 },
  dualSub: { color: Colors.textSecondary, fontSize: 11, marginTop: 2 },
  barTrack: { height: 6, borderRadius: 4, backgroundColor: Colors.bgAlt, marginTop: 10, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 4 },

  rowHead: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: Spacing.sm },
  sectionTitle: { fontSize: 15, fontWeight: "800", color: Colors.textPrimary },
  accRow: { flexDirection: "row", gap: 8 },
  accBox: { flex: 1, alignItems: "center", padding: 10, backgroundColor: Colors.bgAlt, borderRadius: Radii.md },
  accIcon: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  accValue: { fontSize: 22, fontWeight: "800", marginTop: 6 },
  accLabel: { fontSize: 10, color: Colors.textMuted, marginTop: 2, fontWeight: "700", textAlign: "center" },

  factorItem: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  factorLabel: { fontSize: 14, fontWeight: "800", color: Colors.textPrimary },
  factorDetail: { color: Colors.textSecondary, fontSize: 12, marginTop: 2, lineHeight: 18 },
  impactPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radii.pill },

  downloadBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    paddingVertical: 12, borderRadius: Radii.pill, backgroundColor: Colors.primary + "15",
  },
  downloadText: { color: Colors.primary, fontWeight: "800", fontSize: 14 },
});
