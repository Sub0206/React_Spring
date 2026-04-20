import React, { useEffect, useState, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert,
  ActivityIndicator, Image, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { Input, PrimaryButton, Card, Badge } from "../../src/ui";
import { Colors, Radii, Shadows, Spacing } from "../../src/theme";
import { api } from "../../src/api";

type Client = {
  client_id: string; name: string; mobile: string;
  aadhaar_masked: string; pan: string;
  aadhaar_name?: string; pan_name?: string; pan_dob?: string;
  avatar?: string | null;
};

type Step = "review" | "loan" | "upload" | "analyzing" | "analysis" | "cibil" | "summary";

const riskHex = (c?: string) =>
  c === "green" ? Colors.success : c === "yellow" ? Colors.secondary : c === "red" ? Colors.danger : Colors.textMuted;

const bandHex = (c?: string) =>
  c === "blue" ? "#2196F3" : c === "green" ? Colors.success : c === "yellow" ? Colors.secondary : c === "red" ? Colors.danger : Colors.textMuted;

export default function NewLoan() {
  const { clientId } = useLocalSearchParams<{ clientId: string }>();
  const router = useRouter();
  const [client, setClient] = useState<Client | null>(null);
  const [step, setStep] = useState<Step>("review");

  // Loan input
  const [amount, setAmount] = useState("50000");
  const [purpose, setPurpose] = useState("Personal");
  const [term, setTerm] = useState("12");
  const [rate, setRate] = useState("11.0");

  // Upload
  const [file, setFile] = useState<{ name: string; size: number } | null>(null);
  const [months, setMonths] = useState<3 | 6 | 12>(6);

  // Analysis
  const [analysis, setAnalysis] = useState<any | null>(null);
  const [cibil, setCibil] = useState<any | null>(null);
  const [loadingCibil, setLoadingCibil] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      try { setClient(await api<Client>(`/clients/${clientId}`)); }
      catch (e: any) { Alert.alert("Error", e.message); }
    })();
  }, [clientId]);

  const pickDoc = useCallback(async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "image/*"],
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.[0]) return;
      const a = res.assets[0];
      setFile({ name: a.name, size: a.size || 0 });
    } catch (e: any) {
      Alert.alert("Error", e.message || "Could not pick file");
    }
  }, []);

  const runAnalysis = async () => {
    if (!file) { Alert.alert("Upload required", "Please upload a bank statement first."); return; }
    setStep("analyzing");
    try {
      const res = await api<any>("/loan-apps/analyze-statement", {
        method: "POST",
        body: { client_id: clientId, file_name: file.name, file_size: file.size, months },
      });
      setAnalysis(res);
      setStep("analysis");
    } catch (e: any) {
      Alert.alert("Analysis failed", e.message);
      setStep("upload");
    }
  };

  const runCibil = async () => {
    setLoadingCibil(true);
    try {
      const res = await api<any>("/loan-apps/check-cibil", {
        method: "POST", body: { client_id: clientId },
      });
      setCibil(res);
      setStep("summary");
    } catch (e: any) {
      Alert.alert("CIBIL failed", e.message);
    } finally { setLoadingCibil(false); }
  };

  const createLoan = async () => {
    setSubmitting(true);
    try {
      await api("/loan-apps/create", {
        method: "POST",
        body: {
          client_id: clientId,
          amount: parseFloat(amount),
          purpose,
          term_months: parseInt(term, 10),
          interest_rate: parseFloat(rate),
          statement_analysis: analysis,
          cibil_report: cibil,
        },
      });
      Alert.alert("Loan created", "Loan application recorded. You can review and fund it from Requests.", [
        { text: "OK", onPress: () => router.replace("/(tabs)/applications") },
      ]);
    } catch (e: any) {
      Alert.alert("Failed", e.message);
    } finally { setSubmitting(false); }
  };

  const downloadReport = (kind: "statement" | "cibil") => {
    const data = kind === "statement" ? analysis : cibil;
    if (!data) return;
    const header = kind === "statement" ? "BANK STATEMENT ANALYSIS" : "CIBIL CREDIT REPORT";
    const lines: string[] = [
      `============================================`,
      `  LENDIFY · ${header}`,
      `============================================`,
      `Client: ${client?.name}`,
      `PAN: ${client?.pan}  |  Mobile: +91 ${client?.mobile}`,
      `Generated: ${new Date().toLocaleString()}`,
      ``,
    ];
    if (kind === "statement") {
      lines.push(`Months analyzed: ${data.months_analyzed}`);
      lines.push(`Bounce risk:     ${String(data.bounce_risk).toUpperCase()}`);
      lines.push(`Total credit:    ₹${data.total_credit.toLocaleString()}`);
      lines.push(`Total debit:     ₹${data.total_debit.toLocaleString()}`);
      lines.push(`Avg balance:     ₹${data.avg_balance.toLocaleString()}`);
      lines.push(`Bounced txns:    ${data.bounced_transactions}`);
      lines.push(`Salary credits:  ${data.salary_credits_detected}`);
      lines.push(``);
      lines.push(`Summary: ${data.summary}`);
      lines.push(``);
      lines.push(`Monthly breakdown:`);
      data.chart.forEach((c: any) => {
        lines.push(`  ${c.label}: +₹${c.credit.toLocaleString()}  -₹${c.debit.toLocaleString()}  bounces=${c.bounces}`);
      });
    } else {
      lines.push(`CIBIL score: ${data.score}  (${String(data.band).toUpperCase()})`);
      lines.push(`On-time payments: ${data.on_time_payments_pct}%`);
      lines.push(`Credit utilization: ${data.credit_utilization_pct}%`);
      lines.push(`Total accounts: ${data.total_accounts}`);
      lines.push(`Active loans: ${data.active_loans}`);
      lines.push(`Hard enquiries (6m): ${data.hard_enquiries_6m}`);
      lines.push(``);
      lines.push(`Summary: ${data.summary}`);
      lines.push(``);
      lines.push(`Factors:`);
      (data.factors || []).forEach((f: any) =>
        lines.push(`  [${String(f.impact).toUpperCase()}] ${f.label} — ${f.detail}`));
    }
    const content = lines.join("\n");
    if (Platform.OS === "web" && typeof window !== "undefined") {
      const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `lendify-${kind}-${client?.name || "report"}.txt`.replace(/\s+/g, "_");
      a.click();
      URL.revokeObjectURL(url);
    } else {
      Alert.alert("Report ready", content.slice(0, 1500));
    }
  };

  if (!client) {
    return (
      <SafeAreaView style={styles.safe}>
        <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 80 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.topBar}>
        <TouchableOpacity testID="back-new-loan" onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.topTitle}>New Loan</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.stepsBar}>
        {["Review", "Loan", "Upload", "Analyze", "CIBIL", "Summary"].map((l, i) => {
          const orderMap: Record<Step, number> = { review: 0, loan: 1, upload: 2, analyzing: 3, analysis: 3, cibil: 4, summary: 5 };
          const active = orderMap[step] >= i;
          return (
            <React.Fragment key={l}>
              <View style={[styles.stepDot, { backgroundColor: active ? "#fff" : "#ffffff60" }]} />
              {i < 5 && <View style={[styles.stepLine, { backgroundColor: orderMap[step] > i ? "#fff" : "#ffffff40" }]} />}
            </React.Fragment>
          );
        })}
      </View>

      <ScrollView contentContainerStyle={{ padding: Spacing.lg, paddingBottom: 120 }}>

        {step === "review" && (
          <>
            <Text style={styles.h1}>Client summary</Text>
            <Text style={styles.h1Sub}>Verify client details before starting the loan.</Text>

            <Card style={{ marginTop: Spacing.md }}>
              <View style={styles.clientRow}>
                <Image source={{ uri: client.avatar || "https://via.placeholder.com/60" }} style={styles.avatar} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.clientName}>{client.name}</Text>
                  <Text style={styles.clientSub}>+91 {client.mobile}</Text>
                </View>
              </View>
              <Kv label="Aadhaar" value={client.aadhaar_masked} sub={client.aadhaar_name} icon="card" />
              <Kv label="PAN" value={client.pan} sub={client.pan_name ? `${client.pan_name}${client.pan_dob ? " · DOB " + client.pan_dob : ""}` : ""} icon="document-text" last />
            </Card>

            <View style={{ height: Spacing.md }} />
            <PrimaryButton testID="review-next" title="Looks good · Continue" onPress={() => setStep("loan")} />
          </>
        )}

        {step === "loan" && (
          <>
            <Text style={styles.h1}>Loan details</Text>
            <Text style={styles.h1Sub}>Enter the principal, purpose and tenure.</Text>

            <Card style={{ marginTop: Spacing.md }}>
              <Label text="Loan amount (₹)" />
              <Input testID="input-amount" keyboardType="number-pad" value={amount} onChangeText={(v) => setAmount(v.replace(/[^0-9]/g, ""))} />
              <Label text="Purpose" mt />
              <Input testID="input-purpose" value={purpose} onChangeText={setPurpose} />
              <View style={{ flexDirection: "row", gap: Spacing.sm, marginTop: Spacing.md }}>
                <View style={{ flex: 1 }}>
                  <Label text="Term (months)" />
                  <Input testID="input-term" keyboardType="number-pad" value={term} onChangeText={(v) => setTerm(v.replace(/[^0-9]/g, ""))} />
                </View>
                <View style={{ flex: 1 }}>
                  <Label text="Rate (% APR)" />
                  <Input testID="input-rate" keyboardType="numeric" value={rate} onChangeText={(v) => setRate(v.replace(/[^0-9.]/g, ""))} />
                </View>
              </View>
            </Card>
            <View style={{ height: Spacing.md }} />
            <PrimaryButton testID="loan-next" title="Continue to upload" onPress={() => setStep("upload")} />
          </>
        )}

        {step === "upload" && (
          <>
            <Text style={styles.h1}>Upload bank statement</Text>
            <Text style={styles.h1Sub}>Select period and upload client&apos;s statement (PDF/image).</Text>

            <Card style={{ marginTop: Spacing.md }}>
              <Label text="Period" />
              <View style={styles.pillRow}>
                {[3, 6, 12].map((m) => (
                  <TouchableOpacity
                    key={m}
                    testID={`months-${m}`}
                    onPress={() => setMonths(m as any)}
                    style={[styles.pill, months === m && styles.pillActive]}
                  >
                    <Text style={[styles.pillText, months === m && styles.pillTextActive]}>{m} months</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={{ height: Spacing.md }} />
              <TouchableOpacity testID="pick-doc" onPress={pickDoc} activeOpacity={0.9} style={styles.uploadBox}>
                <View style={styles.uploadIcon}>
                  <Ionicons name={file ? "document-attach" : "cloud-upload"} size={34} color={Colors.primary} />
                </View>
                {file ? (
                  <>
                    <Text style={styles.uploadTitle}>{file.name}</Text>
                    <Text style={styles.uploadSub}>{(file.size / 1024).toFixed(1)} KB · Tap to replace</Text>
                  </>
                ) : (
                  <>
                    <Text style={styles.uploadTitle}>Tap to upload</Text>
                    <Text style={styles.uploadSub}>PDF or image · Max 10MB</Text>
                  </>
                )}
              </TouchableOpacity>
            </Card>

            <View style={{ height: Spacing.md }} />
            <PrimaryButton testID="analyze-btn" title="Analyze statement" disabled={!file} onPress={runAnalysis} />
          </>
        )}

        {step === "analyzing" && (
          <View style={styles.analyzingBox}>
            <View style={styles.pulseCircle}>
              <Ionicons name="analytics" size={48} color={Colors.primary} />
            </View>
            <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: Spacing.lg }} />
            <Text style={styles.analyzingTitle}>Analyzing statement…</Text>
            <Text style={styles.analyzingSub}>Our AI is reviewing credits, debits and bounce history.</Text>
          </View>
        )}

        {step === "analysis" && analysis && (
          <>
            <View style={[styles.riskCard, { backgroundColor: riskHex(analysis.risk_color) + "12", borderColor: riskHex(analysis.risk_color) }]}>
              <View style={[styles.riskDot, { backgroundColor: riskHex(analysis.risk_color) }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.riskLabel}>BOUNCE RISK</Text>
                <Text style={[styles.riskValue, { color: riskHex(analysis.risk_color) }]}>{String(analysis.bounce_risk).toUpperCase()}</Text>
                <Text style={styles.riskSub}>{analysis.summary}</Text>
              </View>
            </View>

            <Card style={{ marginTop: Spacing.md }}>
              <Text style={styles.sectionTitle}>Monthly activity</Text>
              <Chart data={analysis.chart} riskColor={riskHex(analysis.risk_color)} />
              <View style={styles.statRow}>
                <Stat label="Total credit" value={`₹${(analysis.total_credit / 1000).toFixed(0)}k`} color={Colors.success} />
                <Stat label="Total debit" value={`₹${(analysis.total_debit / 1000).toFixed(0)}k`} color={Colors.danger} />
                <Stat label="Avg bal" value={`₹${(analysis.avg_balance / 1000).toFixed(0)}k`} color={Colors.primary} />
                <Stat label="Bounces" value={String(analysis.bounced_transactions)} color={riskHex(analysis.risk_color)} />
              </View>
            </Card>

            <Card style={{ marginTop: Spacing.md }}>
              <Text style={styles.sectionTitle}>Highlights</Text>
              {(analysis.highlights || []).map((h: string, i: number) => (
                <View key={i} style={styles.bullet}>
                  <Ionicons name="checkmark-circle" size={16} color={Colors.primary} />
                  <Text style={styles.bulletText}>{h}</Text>
                </View>
              ))}
            </Card>

            <TouchableOpacity testID="download-statement" onPress={() => downloadReport("statement")} style={styles.downloadBtn}>
              <Ionicons name="download" size={18} color={Colors.primary} />
              <Text style={styles.downloadText}>Download statement analysis</Text>
            </TouchableOpacity>

            <View style={{ height: Spacing.md }} />
            <PrimaryButton testID="goto-cibil" title="Check CIBIL" onPress={() => setStep("cibil")} />
            <View style={{ height: Spacing.sm }} />
            <PrimaryButton testID="skip-cibil" title="Skip CIBIL · Go to summary" variant="secondary" onPress={() => setStep("summary")} />
          </>
        )}

        {step === "cibil" && (
          <>
            <Text style={styles.h1}>CIBIL enquiry</Text>
            <Text style={styles.h1Sub}>Fetch credit bureau report for this client.</Text>

            <View style={styles.cibilHero}>
              <Ionicons name="speedometer" size={56} color="#fff" />
              <Text style={styles.cibilHeroTitle}>Live credit score</Text>
              <Text style={styles.cibilHeroSub}>We&apos;ll fetch a fresh CIBIL report using the client&apos;s PAN.</Text>
            </View>

            <View style={{ height: Spacing.md }} />
            <PrimaryButton testID="run-cibil" title="Run CIBIL check" loading={loadingCibil} onPress={runCibil} />
            <View style={{ height: Spacing.sm }} />
            <PrimaryButton title="Back" variant="secondary" onPress={() => setStep("analysis")} />
          </>
        )}

        {step === "summary" && (
          <>
            <Text style={styles.h1}>Application summary</Text>
            <Text style={styles.h1Sub}>Review risk & confirm to create the loan.</Text>

            <Card style={{ marginTop: Spacing.md }}>
              <View style={styles.clientRow}>
                <Image source={{ uri: client.avatar || "https://via.placeholder.com/60" }} style={styles.avatar} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.clientName}>{client.name}</Text>
                  <Text style={styles.clientSub}>₹{parseFloat(amount || "0").toLocaleString()} · {term} months · {rate}% APR</Text>
                </View>
              </View>
            </Card>

            {analysis && (
              <View style={[styles.riskCard, { backgroundColor: riskHex(analysis.risk_color) + "12", borderColor: riskHex(analysis.risk_color) }]}>
                <View style={[styles.riskDot, { backgroundColor: riskHex(analysis.risk_color) }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.riskLabel}>BANK STATEMENT</Text>
                  <Text style={[styles.riskValue, { color: riskHex(analysis.risk_color) }]}>{String(analysis.bounce_risk).toUpperCase()} RISK</Text>
                  <Text style={styles.riskSub}>{analysis.bounced_transactions} bounces · Avg ₹{analysis.avg_balance.toLocaleString()}</Text>
                </View>
                <TouchableOpacity onPress={() => downloadReport("statement")} style={styles.iconPill}>
                  <Ionicons name="download" size={16} color={Colors.primary} />
                </TouchableOpacity>
              </View>
            )}

            {cibil && (
              <View style={[styles.riskCard, { backgroundColor: bandHex(cibil.band_color) + "12", borderColor: bandHex(cibil.band_color) }]}>
                <View style={[styles.riskDot, { backgroundColor: bandHex(cibil.band_color) }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.riskLabel}>CIBIL SCORE</Text>
                  <Text style={[styles.riskValue, { color: bandHex(cibil.band_color) }]}>{cibil.score} · {String(cibil.band).toUpperCase()}</Text>
                  <Text style={styles.riskSub}>On-time {cibil.on_time_payments_pct}% · Utilization {cibil.credit_utilization_pct}%</Text>
                </View>
                <TouchableOpacity onPress={() => downloadReport("cibil")} style={styles.iconPill}>
                  <Ionicons name="download" size={16} color={Colors.primary} />
                </TouchableOpacity>
              </View>
            )}

            <Card style={{ marginTop: Spacing.md }}>
              <Text style={styles.sectionTitle}>Overall client risk</Text>
              <OverallRisk analysis={analysis} cibil={cibil} />
            </Card>

            <View style={{ height: Spacing.md }} />
            <PrimaryButton testID="create-loan-btn" title="Create loan application" loading={submitting} onPress={createLoan} />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function OverallRisk({ analysis, cibil }: { analysis: any; cibil: any }) {
  // Simple weighted combo
  let score = 50;
  if (analysis) {
    score += analysis.risk_color === "green" ? 20 : analysis.risk_color === "yellow" ? 0 : -20;
  }
  if (cibil) {
    score += (cibil.score - 650) / 10;
  }
  score = Math.max(0, Math.min(100, Math.round(score)));
  const label = score >= 70 ? "LOW RISK" : score >= 45 ? "MODERATE" : "HIGH RISK";
  const color = score >= 70 ? Colors.success : score >= 45 ? Colors.secondary : Colors.danger;

  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 10 }}>
        <Text style={{ fontSize: 40, fontWeight: "800", color, letterSpacing: -1 }}>{score}</Text>
        <Text style={{ color: Colors.textMuted, fontSize: 13 }}>/ 100</Text>
        <View style={{ flex: 1 }} />
        <View style={{ paddingHorizontal: 12, paddingVertical: 5, borderRadius: Radii.pill, backgroundColor: color + "1A" }}>
          <Text style={{ color, fontWeight: "800", fontSize: 12 }}>{label}</Text>
        </View>
      </View>
      <View style={{ height: 10, backgroundColor: Colors.bgAlt, borderRadius: 8, marginTop: 10, overflow: "hidden" }}>
        <View style={{ width: `${score}%`, height: "100%", backgroundColor: color }} />
      </View>
      <Text style={{ color: Colors.textSecondary, fontSize: 13, marginTop: 10, lineHeight: 20 }}>
        Combined assessment of bank-statement bounce risk and CIBIL credit discipline. Green = confident lend, Amber = review, Red = caution.
      </Text>
    </View>
  );
}

function Chart({ data, riskColor }: { data: any[]; riskColor: string }) {
  const max = Math.max(1, ...data.map((d) => Math.max(d.credit, d.debit)));
  return (
    <View style={{ marginTop: Spacing.sm }}>
      <View style={{ flexDirection: "row", alignItems: "flex-end", height: 140, gap: 6 }}>
        {data.map((d, i) => (
          <View key={i} style={{ flex: 1, alignItems: "center" }}>
            <View style={{ flexDirection: "row", gap: 2, alignItems: "flex-end", height: 120 }}>
              <View style={{ width: 10, height: Math.max(4, (d.credit / max) * 120), backgroundColor: Colors.success, borderTopLeftRadius: 4, borderTopRightRadius: 4 }} />
              <View style={{ width: 10, height: Math.max(4, (d.debit / max) * 120), backgroundColor: Colors.danger, borderTopLeftRadius: 4, borderTopRightRadius: 4 }} />
            </View>
            {d.bounces > 0 && (
              <View style={{ position: "absolute", top: 0, backgroundColor: riskColor, borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1 }}>
                <Text style={{ color: "#fff", fontSize: 9, fontWeight: "800" }}>{d.bounces}×</Text>
              </View>
            )}
            <Text style={{ fontSize: 10, color: Colors.textMuted, fontWeight: "600", marginTop: 4 }}>{d.label}</Text>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: "row", justifyContent: "center", gap: 12, marginTop: 8 }}>
        <Legend color={Colors.success} label="Credit" />
        <Legend color={Colors.danger} label="Debit" />
        <Legend color={riskColor} label="Bounces" />
      </View>
    </View>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
      <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: color }} />
      <Text style={{ fontSize: 11, color: Colors.textSecondary, fontWeight: "600" }}>{label}</Text>
    </View>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.statBox}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function Kv({ label, value, sub, icon, last }: { label: string; value: string; sub?: string; icon: any; last?: boolean }) {
  return (
    <View style={[kvStyles.row, !last && kvStyles.divider]}>
      <View style={kvStyles.iconWrap}>
        <Ionicons name={icon} size={18} color={Colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={kvStyles.label}>{label}</Text>
        <Text style={kvStyles.value}>{value}</Text>
        {!!sub && <Text style={kvStyles.sub}>{sub}</Text>}
      </View>
    </View>
  );
}

function Label({ text, mt }: { text: string; mt?: boolean }) {
  return <Text style={[styles.label, mt && { marginTop: Spacing.md }]}>{text}</Text>;
}

const kvStyles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  divider: { borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  iconWrap: { width: 34, height: 34, borderRadius: Radii.pill, backgroundColor: Colors.primary + "15", alignItems: "center", justifyContent: "center" },
  label: { color: Colors.textMuted, fontSize: 11, fontWeight: "700", letterSpacing: 0.5 },
  value: { color: Colors.textPrimary, fontSize: 14, fontWeight: "700", marginTop: 2 },
  sub: { color: Colors.textSecondary, fontSize: 12, marginTop: 1 },
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  topBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, backgroundColor: Colors.primary },
  backBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  topTitle: { flex: 1, textAlign: "center", fontSize: 18, fontWeight: "800", color: "#fff" },
  stepsBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, backgroundColor: Colors.primary },
  stepDot: { width: 10, height: 10, borderRadius: 5 },
  stepLine: { flex: 1, height: 3, borderRadius: 3, marginHorizontal: 2 },
  h1: { fontSize: 22, fontWeight: "800", color: Colors.textPrimary, marginTop: Spacing.sm },
  h1Sub: { color: Colors.textSecondary, fontSize: 14, marginTop: 4 },
  clientRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: Spacing.md },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: Colors.bgAlt },
  clientName: { fontSize: 17, fontWeight: "800", color: Colors.textPrimary },
  clientSub: { color: Colors.textSecondary, fontSize: 13, marginTop: 2 },
  sectionTitle: { fontSize: 15, fontWeight: "800", color: Colors.textPrimary, marginBottom: Spacing.sm },
  label: { fontSize: 12, fontWeight: "700", color: Colors.textSecondary, letterSpacing: 0.5, marginBottom: 6 },
  pillRow: { flexDirection: "row", gap: 8 },
  pill: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: Radii.pill, backgroundColor: Colors.bgAlt },
  pillActive: { backgroundColor: Colors.primary },
  pillText: { color: Colors.textSecondary, fontWeight: "700", fontSize: 13 },
  pillTextActive: { color: "#fff" },
  uploadBox: {
    borderWidth: 2, borderColor: Colors.primary + "55", borderStyle: "dashed",
    borderRadius: Radii.lg, padding: Spacing.lg, alignItems: "center",
    backgroundColor: Colors.primary + "08",
  },
  uploadIcon: { width: 70, height: 70, borderRadius: 35, backgroundColor: Colors.primary + "1A", alignItems: "center", justifyContent: "center", marginBottom: 10 },
  uploadTitle: { fontSize: 16, fontWeight: "800", color: Colors.textPrimary },
  uploadSub: { color: Colors.textSecondary, fontSize: 13, marginTop: 2 },
  analyzingBox: { alignItems: "center", paddingVertical: Spacing.xxl },
  pulseCircle: {
    width: 120, height: 120, borderRadius: 60, backgroundColor: Colors.primary + "15",
    alignItems: "center", justifyContent: "center",
  },
  analyzingTitle: { fontSize: 20, fontWeight: "800", color: Colors.textPrimary, marginTop: Spacing.md },
  analyzingSub: { color: Colors.textSecondary, fontSize: 13, marginTop: 6, textAlign: "center", paddingHorizontal: Spacing.lg },
  riskCard: {
    flexDirection: "row", alignItems: "center", gap: 12, marginTop: Spacing.md,
    borderRadius: Radii.xl, padding: Spacing.md, borderWidth: 2,
  },
  riskDot: { width: 14, height: 14, borderRadius: 7 },
  riskLabel: { fontSize: 10, fontWeight: "800", color: Colors.textMuted, letterSpacing: 1 },
  riskValue: { fontSize: 22, fontWeight: "800", letterSpacing: -0.5, marginTop: 2 },
  riskSub: { color: Colors.textSecondary, fontSize: 12, marginTop: 2, lineHeight: 18 },
  iconPill: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  statRow: { flexDirection: "row", justifyContent: "space-between", marginTop: Spacing.md, gap: 6 },
  statBox: { flex: 1, alignItems: "center", padding: 8, backgroundColor: Colors.bgAlt, borderRadius: Radii.md },
  statValue: { fontSize: 16, fontWeight: "800" },
  statLabel: { fontSize: 10, color: Colors.textMuted, marginTop: 2, fontWeight: "700" },
  bullet: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginTop: 6 },
  bulletText: { flex: 1, color: Colors.textPrimary, fontSize: 13, lineHeight: 20 },
  downloadBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    marginTop: Spacing.md, paddingVertical: 12, borderRadius: Radii.pill,
    backgroundColor: Colors.primary + "15",
  },
  downloadText: { color: Colors.primary, fontWeight: "800", fontSize: 14 },
  cibilHero: {
    marginTop: Spacing.md, backgroundColor: Colors.info, borderRadius: Radii.xl,
    padding: Spacing.lg, alignItems: "center", ...Shadows.button,
  },
  cibilHeroTitle: { color: "#fff", fontSize: 20, fontWeight: "800", marginTop: Spacing.sm },
  cibilHeroSub: { color: "#EADFFB", fontSize: 13, marginTop: 6, textAlign: "center" },
});
