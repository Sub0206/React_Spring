import React, { useEffect, useState, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert,
  ActivityIndicator, Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { Input, PrimaryButton, Card, Badge, InitialsAvatar } from "../../src/ui";
import { Colors, Radii, Shadows, Spacing } from "../../src/theme";
import { api } from "../../src/api";
import { downloadPdf } from "../../src/pdf";
import { useThemedStyles } from "../../src/themeContext";

type Client = {
  client_id: string; name: string; mobile: string;
  aadhaar_masked: string; pan: string;
  aadhaar_name?: string; pan_name?: string; pan_dob?: string;
  avatar?: string | null;
};

type Step = "review" | "upload" | "analyzing" | "analysis" | "cibil" | "summary";

const riskHex = (c?: string) =>
  c === "green" ? Colors.success : c === "yellow" ? Colors.secondary : c === "red" ? Colors.danger : Colors.textMuted;

const bandHex = (c?: string) =>
  c === "blue" ? "#2196F3" : c === "green" ? Colors.success : c === "yellow" ? Colors.secondary : c === "red" ? Colors.danger : Colors.textMuted;

export default function NewLoan() {
  const styles = useScreenStyles();
  const { clientId } = useLocalSearchParams<{ clientId: string }>();
  const router = useRouter();
  const [client, setClient] = useState<Client | null>(null);
  const [step, setStep] = useState<Step>("review");

  // P0 — Risk warning modal data. Fetched from /clients/{id}/risk-summary.
  type RiskSummary = {
    kind: "on_track" | "overdue_mild" | "overdue_high";
    late_payments: number;
    missed_months: string[];
    missed_months_count: number;
    overdue_count: number;
    overdue_amount: number;
    overdue_loans: { loan_id: string; kind: string; overdue_count: number; overdue_amount: number }[];
    active_loan_count: number;
  };
  const [riskSummary, setRiskSummary] = useState<RiskSummary | null>(null);
  const [riskWarnOpen, setRiskWarnOpen] = useState(false);
  const [riskAcknowledged, setRiskAcknowledged] = useState(false);

  // Upload
  const [file, setFile] = useState<{ name: string; size: number; b64?: string } | null>(null);
  const [months, setMonths] = useState<3 | 6 | 12>(6);

  // Analysis
  const [analysis, setAnalysis] = useState<any | null>(null);
  const [cibil, setCibil] = useState<any | null>(null);
  const [loadingCibil, setLoadingCibil] = useState(false);

  // Reject modal
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rejecting, setRejecting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        setClient(await api<Client>(`/clients/${clientId}`));
      } catch (e: any) {
        Alert.alert("Error", e.message);
      }
      try {
        const rs = await api<RiskSummary>(`/clients/${clientId}/risk-summary`);
        setRiskSummary(rs);
        if (rs.kind !== "on_track") {
          // Show the blocking modal. User MUST explicitly acknowledge before
          // the screen's primary actions unlock.
          setRiskWarnOpen(true);
        }
      } catch {/* silent — non-fatal */}
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

      // Read file as base64 for real-parse on the backend.
      let b64: string | undefined;
      try {
        if (a.uri?.startsWith("data:")) {
          // Web path — expo-document-picker returns a data URL here.
          b64 = a.uri.split(",", 2)[1];
        } else {
          const FS = await import("expo-file-system/legacy");
          b64 = await FS.readAsStringAsync(a.uri, { encoding: "base64" as any });
        }
      } catch (err) {
        // Not fatal — the backend will fall back to deterministic analysis.
        b64 = undefined;
      }
      setFile({ name: a.name, size: a.size || 0, b64 });
    } catch (e: any) {
      Alert.alert("Error", e.message || "Could not pick file");
    }
  }, []);

  // Step-based back navigation: returns to previous step within the loan-new flow
  // before letting the system exit to Client Details.
  const stepBack = useCallback(() => {
    const order: Step[] = ["review", "upload", "analyzing", "analysis", "cibil", "summary"];
    const idx = order.indexOf(step);
    if (idx > 0) {
      // Skip the "analyzing" transient state on the way back
      const prev = order[idx - 1] === "analyzing" ? order[idx - 2] : order[idx - 1];
      setStep(prev as Step);
    } else {
      router.back();
    }
  }, [step, router]);

  const runAnalysis = async () => {
    if (!file) { Alert.alert("Upload required", "Please upload a bank statement first."); return; }
    // Heuristic pre-validation: a typical bank statement page is ~30KB; require roughly
    // 40KB * months as a floor to avoid clearly short uploads.
    const minBytes = 40 * 1024 * months;
    if ((file.size || 0) > 0 && (file.size || 0) < minBytes) {
      Alert.alert(
        `Please upload a valid ${months} months bank statement PDF`,
        `The uploaded file looks too small to cover ${months} months of transactions. Please upload the complete ${months}-month statement.`,
      );
      return;
    }
    setStep("analyzing");
    try {
      const res = await api<any>("/loan-apps/analyze-statement", {
        method: "POST",
        body: {
          client_id: clientId,
          file_name: file.name,
          file_size: file.size,
          months,
          file_base64: file.b64,  // real PDF bytes (b64) — enables actual parsing + bounce detection
        },
      });
      // Backend returns months_analyzed — if less than requested AND the file was actually parsed,
      // reject the upload (deterministic mock path always returns full coverage).
      const covered = Number(res?.months_covered_in_file || res?.months_analyzed || 0);
      const source = String(res?.parse_source || "mock");
      if (source === "parsed" && covered > 0 && covered < months) {
        Alert.alert(
          `Please upload a valid ${months} months bank statement PDF`,
          `The statement we received only covers ${covered} month(s). We need a full ${months}-month statement for a reliable decision.`,
        );
        setStep("upload");
        return;
      }
      setAnalysis(res);
      setStep("analysis");
    } catch (e: any) {
      Alert.alert("Analysis failed", e.message);
      setStep("upload");
    }
  };

  const downloadPdfReport = useCallback(async () => {
    try {
      const name = (client?.name || "report").replace(/\s+/g, "_");
      await downloadPdf(
        `/api/clients/${clientId}/analysis-report.pdf?months=${months}`,
        `document_analysis_report_${name}.pdf`,
      );
    } catch (e: any) {
      Alert.alert("Download failed", e.message || "Could not download PDF.");
    }
  }, [clientId, months, client]);

  const runCibil = async () => {
    setLoadingCibil(true);
    try {
      const res = await api<any>("/loan-apps/check-cibil", {
        method: "POST", body: { client_id: clientId },
      });
      setCibil(res);
      // Pre-set summary step so that when user presses back from the report page,
      // they land on the summary view with CIBIL populated.
      setStep("summary");
      router.push({
        pathname: "/cibil-report/[clientId]",
        params: { clientId: String(clientId), data: JSON.stringify(res) },
      });
    } catch (e: any) {
      Alert.alert("CIBIL failed", e.message);
    } finally { setLoadingCibil(false); }
  };

  const openCibilReport = () => {
    if (!cibil) return;
    router.push({
      pathname: "/cibil-report/[clientId]",
      params: { clientId: String(clientId), data: JSON.stringify(cibil) },
    });
  };

  const createLoan = () => {
    // Go to approve flow — pass statement + cibil through global state using AsyncStorage-like session
    router.push({
      pathname: "/loan-approve/[clientId]",
      params: {
        clientId: String(clientId),
        analysis: JSON.stringify(analysis || {}),
        cibil: JSON.stringify(cibil || {}),
      },
    });
  };

  const submitReject = async () => {
    if (!rejectReason.trim()) {
      Alert.alert("Reason required", "Please enter why this client is being rejected.");
      return;
    }
    setRejecting(true);
    try {
      await api("/loan-apps/reject", {
        method: "POST",
        body: {
          client_id: clientId,
          reason: rejectReason.trim(),
          statement_analysis: analysis,
          cibil_report: cibil,
        },
      });
      setRejectOpen(false);
      Alert.alert("Client rejected", "This client has been marked rejected.", [
        { text: "OK", onPress: () => router.replace("/(tabs)/clients") },
      ]);
    } catch (e: any) {
      Alert.alert("Failed", e.message);
    } finally { setRejecting(false); }
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
        <TouchableOpacity testID="back-new-loan" onPress={stepBack} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.topTitle}>New Loan</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.stepsBar}>
        {["Review", "Upload", "Analyze", "CIBIL", "Summary"].map((l, i) => {
          const orderMap: Record<Step, number> = { review: 0, upload: 1, analyzing: 2, analysis: 2, cibil: 3, summary: 4 };
          const active = orderMap[step] >= i;
          return (
            <React.Fragment key={l}>
              <View style={[styles.stepDot, { backgroundColor: active ? "#fff" : "#ffffff60" }]} />
              {i < 4 && <View style={[styles.stepLine, { backgroundColor: orderMap[step] > i ? "#fff" : "#ffffff40" }]} />}
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
                <InitialsAvatar name={client.name} size={48} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.clientName}>{client.name}</Text>
                  <Text style={styles.clientSub}>+91 {client.mobile}</Text>
                </View>
              </View>
              <Kv label="Aadhaar" value={client.aadhaar_masked} sub={client.aadhaar_name} icon="card" />
              <Kv label="PAN" value={client.pan} sub={client.pan_name ? `${client.pan_name}${client.pan_dob ? " · DOB " + client.pan_dob : ""}` : ""} icon="document-text" last />
            </Card>

            <View style={{ height: Spacing.md }} />
            <PrimaryButton testID="review-next" title="Continue" onPress={() => setStep("upload")} />
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

            {/* Transparent "why this risk?" card — derived from the rules engine */}
            {(analysis.risk_reasons || []).length > 0 && (
              <Card style={{ marginTop: Spacing.md }}>
                <Text style={styles.sectionTitle}>Why this risk score?</Text>
                {(analysis.risk_reasons || []).map((r: any, i: number) => {
                  const sev = String(r.severity || "low").toLowerCase();
                  const sc = sev === "high" ? Colors.danger : sev === "medium" ? Colors.warning : Colors.success;
                  return (
                    <View key={i} style={[styles.flagRow, { borderLeftColor: sc }]}>
                      <View style={[styles.flagPill, { backgroundColor: sc + "1A" }]}>
                        <Text style={[styles.flagPillText, { color: sc }]}>{sev.toUpperCase()}</Text>
                      </View>
                      <Text style={[styles.flagTitle, { flex: 1 }]}>{r.label}</Text>
                    </View>
                  );
                })}
              </Card>
            )}

            {/* Parsing / confidence transparency */}
            <Card style={{ marginTop: Spacing.md }}>
              <Text style={styles.sectionTitle}>Parsing confidence</Text>
              <View style={styles.confRow}>
                <Text style={styles.confLabel}>Accuracy</Text>
                <View style={[styles.confPill, {
                  backgroundColor:
                    analysis.parse_confidence === "high" ? Colors.success + "1A" :
                    analysis.parse_confidence === "low"  ? Colors.danger  + "1A" :
                    Colors.warning + "1A",
                }]}>
                  <Text style={[styles.confPillText, {
                    color:
                      analysis.parse_confidence === "high" ? Colors.success :
                      analysis.parse_confidence === "low"  ? Colors.danger  : Colors.warning,
                  }]}>
                    {String(analysis.parse_confidence || "medium").toUpperCase()}
                  </Text>
                </View>
              </View>
              <View style={styles.confRow}>
                <Text style={styles.confLabel}>Rows extracted</Text>
                <Text style={styles.confValue}>{analysis.rows_extracted || 0}</Text>
              </View>
              <View style={styles.confRow}>
                <Text style={styles.confLabel}>Bounce matches</Text>
                <Text style={[styles.confValue, { color: (analysis.bounce_matches_found || 0) > 0 ? Colors.danger : Colors.textSecondary }]}>
                  {analysis.bounce_matches_found || 0}
                </Text>
              </View>
              <View style={styles.confRow}>
                <Text style={styles.confLabel}>Source</Text>
                <Text style={styles.confValue}>{analysis.parse_source === "parsed" ? "PDF parsed" : "Deterministic"}</Text>
              </View>
              <View style={styles.confRow}>
                <Text style={styles.confLabel}>Missing pages</Text>
                <Text style={[styles.confValue, { color: analysis.fraud_checks?.missing_pages_detected ? Colors.danger : Colors.success }]}>
                  {analysis.fraud_checks?.missing_pages_detected ? "Detected" : "None"}
                </Text>
              </View>
              {analysis.manual_review_recommended && (
                <View style={[styles.manualReview, { backgroundColor: Colors.warningSoft, borderColor: Colors.warning }]}>
                  <Ionicons name="warning" size={18} color={Colors.warning} />
                  <Text style={[styles.flagTitle, { color: Colors.warning, flex: 1 }]}>Manual review recommended</Text>
                </View>
              )}
            </Card>

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

            {/* Premium pre-download dashboard */}
            <View style={styles.metricGrid}>
              <MetricCard
                icon="shield-checkmark"
                label="AI Risk"
                value={String(analysis.bounce_risk || "—").toUpperCase()}
                color={riskHex(analysis.risk_color)}
              />
              <MetricCard
                icon="trophy"
                label="Eligibility"
                value={String(analysis.loan_eligibility || "—").toUpperCase()}
                color={analysis.loan_eligibility === "strong" ? Colors.success : analysis.loan_eligibility === "weak" ? Colors.danger : Colors.warning}
              />
              <MetricCard
                icon="trending-up"
                label="Avg Income"
                value={`₹${Math.round((analysis.avg_monthly_credit || 0) / 1000)}k`}
                color={Colors.primary}
              />
              <MetricCard
                icon="card"
                label="EMI Load"
                value={`${analysis.emi_load_pct || 0}%`}
                color={(analysis.emi_load_pct || 0) > 40 ? Colors.danger : Colors.success}
              />
              <MetricCard
                icon="alert-circle"
                label="Bounces"
                value={String(analysis.bounced_transactions || 0)}
                color={(analysis.bounced_transactions || 0) > 0 ? Colors.danger : Colors.success}
              />
              <MetricCard
                icon="checkmark-done"
                label="OCR Accuracy"
                value={`${analysis.fraud_checks?.ocr_confidence_pct ?? 99}%`}
                color={Colors.info}
              />
            </View>

            {/* Lending decision */}
            {analysis.recommended_decision && (
              <View style={[styles.decisionCard, {
                backgroundColor:
                  analysis.recommended_decision === "approve" ? Colors.successSoft :
                  analysis.recommended_decision === "approve_with_caution" ? Colors.warningSoft :
                  Colors.dangerSoft,
                borderColor:
                  analysis.recommended_decision === "approve" ? Colors.success :
                  analysis.recommended_decision === "approve_with_caution" ? Colors.warning :
                  Colors.danger,
              }]}>
                <Ionicons
                  name={
                    analysis.recommended_decision === "approve" ? "checkmark-circle" :
                    analysis.recommended_decision === "approve_with_caution" ? "warning" :
                    "close-circle"
                  }
                  size={30}
                  color={
                    analysis.recommended_decision === "approve" ? Colors.success :
                    analysis.recommended_decision === "approve_with_caution" ? Colors.warning :
                    Colors.danger
                  }
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.decisionLabel}>AI LENDING DECISION</Text>
                  <Text style={styles.decisionValue}>
                    {String(analysis.recommended_decision).toUpperCase().replace(/_/g, " ")}
                  </Text>
                  {analysis.suggested_loan_amount > 0 && (
                    <Text style={styles.decisionSub}>
                      Suggested: ₹{analysis.suggested_loan_amount.toLocaleString()} · EMI ₹{(analysis.suggested_emi || 0).toLocaleString()} · Capacity {analysis.repayment_capacity_pct || 0}%
                    </Text>
                  )}
                </View>
              </View>
            )}

            {/* Red flags */}
            {(analysis.red_flags || []).length > 0 && (
              <Card style={{ marginTop: Spacing.md }}>
                <Text style={styles.sectionTitle}>⚠ Red flags</Text>
                {(analysis.red_flags || []).map((f: any, i: number) => {
                  const sev = String(f.severity || "low").toLowerCase();
                  const sc = sev === "high" ? Colors.danger : sev === "medium" ? Colors.warning : Colors.success;
                  return (
                    <View key={i} style={[styles.flagRow, { borderLeftColor: sc }]}>
                      <View style={[styles.flagPill, { backgroundColor: sc + "1A" }]}>
                        <Text style={[styles.flagPillText, { color: sc }]}>{sev.toUpperCase()}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.flagTitle}>{f.title}</Text>
                        <Text style={styles.flagDetail}>{f.detail}</Text>
                      </View>
                    </View>
                  );
                })}
              </Card>
            )}

            {/* Categories */}
            {(analysis.categories || []).length > 0 && (
              <Card style={{ marginTop: Spacing.md }}>
                <Text style={styles.sectionTitle}>Transaction categories</Text>
                {(analysis.categories || []).slice(0, 6).map((c: any, i: number) => (
                  <View key={i} style={styles.catRow}>
                    <Text style={styles.catName}>{c.name}</Text>
                    <View style={styles.catBar}>
                      <View style={[styles.catFill, {
                        width: `${Math.min(100, c.share_pct)}%`,
                        backgroundColor: c.type === "credit" ? Colors.success : Colors.primary,
                      }]} />
                    </View>
                    <Text style={styles.catAmount}>₹{c.amount.toLocaleString()}</Text>
                  </View>
                ))}
              </Card>
            )}

            <Card style={{ marginTop: Spacing.md }}>
              <Text style={styles.sectionTitle}>Highlights</Text>
              {(analysis.highlights || []).map((h: string, i: number) => (
                <View key={i} style={styles.bullet}>
                  <Ionicons name="checkmark-circle" size={16} color={Colors.primary} />
                  <Text style={styles.bulletText}>{h}</Text>
                </View>
              ))}
            </Card>

            <TouchableOpacity testID="download-statement" onPress={downloadPdfReport} style={styles.downloadBtn}>
              <Ionicons name="document-text" size={18} color="#fff" />
              <Text style={[styles.downloadText, { color: "#fff" }]}>Download Report (PDF)</Text>
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
                <InitialsAvatar name={client.name} size={48} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.clientName}>{client.name}</Text>
                  <Text style={styles.clientSub}>+91 {client.mobile} · {client.pan}</Text>
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
              <TouchableOpacity
                testID="open-cibil-report"
                onPress={openCibilReport}
                activeOpacity={0.9}
                style={[styles.riskCard, { backgroundColor: bandHex(cibil.band_color) + "12", borderColor: bandHex(cibil.band_color) }]}
              >
                <View style={[styles.riskDot, { backgroundColor: bandHex(cibil.band_color) }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.riskLabel}>CIBIL SCORE · TAP TO VIEW REPORT</Text>
                  <Text style={[styles.riskValue, { color: bandHex(cibil.band_color) }]}>{cibil.score} · {String(cibil.band).toUpperCase()}</Text>
                  <Text style={styles.riskSub}>On-time {cibil.on_time_payments_pct}% · Utilization {cibil.credit_utilization_pct}%</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={bandHex(cibil.band_color)} />
              </TouchableOpacity>
            )}

            <Card style={{ marginTop: Spacing.md }}>
              <Text style={styles.sectionTitle}>Overall client risk</Text>
              <OverallRisk analysis={analysis} cibil={cibil} />
            </Card>

            <View style={{ height: Spacing.md }} />
            <View style={{ flexDirection: "row", gap: Spacing.sm }}>
              <View style={{ flex: 1 }}>
                <PrimaryButton testID="reject-btn" title="Reject" variant="danger" onPress={() => setRejectOpen(true)} />
              </View>
              <View style={{ flex: 1 }}>
                <PrimaryButton testID="create-loan-btn" title="Approve" variant="success" onPress={createLoan} />
              </View>
            </View>

            <Modal visible={rejectOpen} transparent animationType="slide" onRequestClose={() => setRejectOpen(false)}>
              <View style={styles.modalBackdrop}>
                <View style={styles.modalSheet}>
                  <Text style={{ fontSize: 18, fontWeight: "800", color: Colors.textPrimary }}>Reject client</Text>
                  <Text style={{ color: Colors.textSecondary, marginTop: 6, marginBottom: Spacing.md }}>Why are you rejecting this client?</Text>
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
                  <PrimaryButton testID="confirm-reject" title="Confirm rejection" variant="danger" loading={rejecting} onPress={submitReject} />
                  <View style={{ height: Spacing.sm }} />
                  <PrimaryButton title="Cancel" variant="secondary" onPress={() => setRejectOpen(false)} />
                </View>
              </View>
            </Modal>
          </>
        )}
      </ScrollView>

      {/* P0: Risk-warning modal shown when the selected client already has
          overdue or at-risk active loans. User MUST explicitly acknowledge
          before any primary action (upload / analyze / approve) unlocks. */}
      <Modal visible={riskWarnOpen} transparent animationType="fade" onRequestClose={() => {}}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalSheet, { maxHeight: "90%" }]}>
            {(() => {
              const isHigh = riskSummary?.kind === "overdue_high";
              const tone = isHigh ? Colors.riskHigh : Colors.riskMild;
              const bg   = isHigh ? Colors.riskHighSoft : Colors.riskMildSoft;
              return (
                <>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: bg, alignItems: "center", justifyContent: "center" }}>
                      <Ionicons name={isHigh ? "alert-circle" : "warning"} size={22} color={tone} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 18, fontWeight: "800", color: Colors.textPrimary }}>
                        {isHigh ? "This borrower is AT RISK" : "Borrower has OVERDUE EMIs"}
                      </Text>
                      <Text style={{ color: Colors.textSecondary, marginTop: 2, fontSize: 12 }}>
                        Review before creating a new loan.
                      </Text>
                    </View>
                  </View>
                  <View style={{ backgroundColor: bg, padding: 14, borderRadius: 14, marginTop: 14, gap: 8 }}>
                    <RiskRow label="Active loans" value={String(riskSummary?.active_loan_count ?? 0)} tone={Colors.textPrimary} />
                    <RiskRow label="Overdue EMIs" value={String(riskSummary?.overdue_count ?? 0)} tone={tone} />
                    <RiskRow label="Overdue amount" value={`\u20b9${(riskSummary?.overdue_amount ?? 0).toLocaleString()}`} tone={tone} />
                    <RiskRow label="Late payments (history)" value={String(riskSummary?.late_payments ?? 0)} tone={Colors.textPrimary} />
                    {(riskSummary?.missed_months?.length ?? 0) > 0 && (
                      <RiskRow
                        label="Missed months"
                        value={riskSummary!.missed_months.join(", ")}
                        tone={tone}
                      />
                    )}
                  </View>
                  {isHigh && (riskSummary?.overdue_loans?.length ?? 0) > 0 && (
                    <View style={{ marginTop: 12 }}>
                      <Text style={{ fontSize: 12, fontWeight: "800", color: Colors.textMuted, letterSpacing: 0.3, marginBottom: 6 }}>
                        LOANS WITH DELAYS
                      </Text>
                      {(riskSummary!.overdue_loans || []).slice(0, 5).map((l) => (
                        <View key={l.loan_id} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 }}>
                          <Text style={{ color: Colors.textPrimary, fontSize: 12, fontWeight: "600" }}>
                            {l.loan_id.slice(0, 14)}\u2026
                          </Text>
                          <Text style={{ color: tone, fontSize: 12, fontWeight: "700" }}>
                            {l.overdue_count} overdue \u00b7 \u20b9{l.overdue_amount.toLocaleString()}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}
                  <View style={{ height: Spacing.md }} />
                  <PrimaryButton
                    testID="risk-ack-continue"
                    title={isHigh ? "I understand the risk, continue" : "Continue anyway"}
                    variant={isHigh ? "danger" : "primary"}
                    onPress={() => { setRiskAcknowledged(true); setRiskWarnOpen(false); }}
                  />
                  <View style={{ height: Spacing.sm }} />
                  <PrimaryButton
                    testID="risk-ack-back"
                    title="Back to clients"
                    variant="secondary"
                    onPress={() => { setRiskWarnOpen(false); router.back(); }}
                  />
                </>
              );
            })()}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function RiskRow({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
      <Text style={{ color: Colors.textSecondary, fontSize: 13 }}>{label}</Text>
      <Text style={{ color: tone, fontSize: 13, fontWeight: "800" }}>{value}</Text>
    </View>
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
  const styles = useScreenStyles();
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
  const styles = useScreenStyles();
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

function useScreenStyles() {
  return useThemedStyles(() => StyleSheet.create({
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
    marginTop: Spacing.md, paddingVertical: 14, borderRadius: Radii.pill,
    backgroundColor: Colors.primary, ...Shadows.button,
  },
  downloadText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  cibilHero: {
    marginTop: Spacing.md, backgroundColor: Colors.info, borderRadius: Radii.xl,
    padding: Spacing.lg, alignItems: "center", ...Shadows.button,
  },
  cibilHeroTitle: { color: "#fff", fontSize: 20, fontWeight: "800", marginTop: Spacing.sm },
  cibilHeroSub: { color: "#EADFFB", fontSize: 13, marginTop: 6, textAlign: "center" },
  modalBackdrop: { flex: 1, backgroundColor: "#00000088", justifyContent: "flex-end" },
  modalSheet: { backgroundColor: Colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: Spacing.lg, paddingBottom: Spacing.xxl },

  metricGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: Spacing.md },
  metricCard: {
    flexBasis: "31%", flexGrow: 1,
    padding: 12, borderRadius: Radii.md,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.borderLight,
  },
  metricIcon: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", marginBottom: 6 },
  metricLabel: { fontSize: 9, fontWeight: "800", color: Colors.textMuted, letterSpacing: 0.5 },
  metricValue: { fontSize: 16, fontWeight: "800", marginTop: 2, letterSpacing: -0.3 },

  decisionCard: {
    flexDirection: "row", alignItems: "center", gap: 12,
    padding: Spacing.md, borderRadius: Radii.lg,
    marginTop: Spacing.md, borderWidth: 1.5,
  },
  decisionLabel: { fontSize: 10, fontWeight: "800", color: Colors.textMuted, letterSpacing: 0.8 },
  decisionValue: { fontSize: 18, fontWeight: "800", color: Colors.textPrimary, marginTop: 2 },
  decisionSub: { fontSize: 12, color: Colors.textSecondary, marginTop: 4, fontWeight: "600" },

  flagRow: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    paddingVertical: 10, borderLeftWidth: 3, paddingLeft: 10, marginBottom: 6,
  },
  flagPill: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: Radii.pill },
  flagPillText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.5 },
  flagTitle: { fontSize: 13, fontWeight: "800", color: Colors.textPrimary },
  flagDetail: { fontSize: 12, color: Colors.textSecondary, marginTop: 2, lineHeight: 17 },

  confRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#F1F5F9" },
  confLabel: { fontSize: 13, color: Colors.textSecondary, fontWeight: "600" },
  confValue: { fontSize: 13, fontWeight: "800", color: Colors.textPrimary },
  confPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  confPillText: { fontSize: 11, fontWeight: "800", letterSpacing: 0.4 },
  manualReview: { flexDirection: "row", alignItems: "center", gap: 10, padding: 10, borderRadius: Radii.md, borderWidth: 1, marginTop: 10 },

  catRow: { flexDirection: "row", alignItems: "center", gap: 8, marginVertical: 4 },
  catName: { width: 110, fontSize: 12, color: Colors.textPrimary, fontWeight: "700" },
  catBar: { flex: 1, height: 8, backgroundColor: Colors.bgAlt, borderRadius: 4, overflow: "hidden" },
  catFill: { height: "100%", borderRadius: 4 },
  catAmount: { fontSize: 12, fontWeight: "800", color: Colors.textPrimary, minWidth: 70, textAlign: "right" },
  }));
}


function MetricCard({ icon, label, value, color }: { icon: any; label: string; value: string; color: string }) {
  const styles = useScreenStyles();
  return (
    <View style={[styles.metricCard, { borderColor: color + "33" }]}>
      <View style={[styles.metricIcon, { backgroundColor: color + "1A" }]}>
        <Ionicons name={icon} size={16} color={color} />
      </View>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, { color }]}>{value}</Text>
    </View>
  );
}
