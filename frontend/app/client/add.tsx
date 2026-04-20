import React, { useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert,
  KeyboardAvoidingView, Platform, Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Input, PrimaryButton } from "../../src/ui";
import { Colors, Radii, Shadows, Spacing } from "../../src/theme";
import { api } from "../../src/api";

type Step = "basic" | "aadhaar" | "pan" | "otp" | "done";

export default function AddClient() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("basic");

  // Basic
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");

  // Aadhaar (new flow: number -> OTP -> verified)
  const [aadhaar, setAadhaar] = useState("");
  const [aadhaarStage, setAadhaarStage] = useState<"input" | "otp" | "verified">("input");
  const [aadhaarVid, setAadhaarVid] = useState<string | null>(null);
  const [aadhaarDemoOtp, setAadhaarDemoOtp] = useState<string | null>(null);
  const [aadhaarOtp, setAadhaarOtp] = useState("");
  const [aadhaarMasked, setAadhaarMasked] = useState("");
  const [aadhaarName, setAadhaarName] = useState("");
  const [aadhaarErr, setAadhaarErr] = useState("");
  const [loadingA, setLoadingA] = useState(false);

  // PAN (name returned, no OTP)
  const [pan, setPan] = useState("");
  const [panStatus, setPanStatus] = useState<"idle" | "checking" | "ok" | "err">("idle");
  const [panName, setPanName] = useState("");
  const [panDob, setPanDob] = useState("");
  const [panEntity, setPanEntity] = useState("");
  const [panErr, setPanErr] = useState("");

  // Mobile OTP
  const [vid, setVid] = useState<string | null>(null);
  const [demoOtp, setDemoOtp] = useState<string | null>(null);
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);

  const sanitizeDigits = (v: string, max: number) => v.replace(/[^0-9]/g, "").slice(0, max);
  const sanitizePan = (v: string) => v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);

  const canProceedBasic = name.trim().length >= 2 && mobile.length === 10;

  const sendAadhaarOtp = async () => {
    if (aadhaar.length !== 12) {
      setAadhaarErr("Aadhaar must be 12 digits.");
      return;
    }
    setLoadingA(true); setAadhaarErr("");
    try {
      const res = await api<{ verification_id: string; demo_otp: string; masked: string }>("/clients/aadhaar-send-otp", {
        method: "POST", body: { aadhaar },
      });
      setAadhaarVid(res.verification_id);
      setAadhaarDemoOtp(res.demo_otp);
      setAadhaarMasked(res.masked);
      setAadhaarStage("otp");
    } catch (e: any) {
      setAadhaarErr(e.message || "Failed to send Aadhaar OTP.");
    } finally { setLoadingA(false); }
  };

  const verifyAadhaarOtp = async () => {
    if (!aadhaarVid || aadhaarOtp.length < 4) {
      Alert.alert("Enter OTP", "Please enter the Aadhaar OTP.");
      return;
    }
    setLoadingA(true); setAadhaarErr("");
    try {
      const res = await api<{ verified: boolean; name: string; masked: string }>("/clients/aadhaar-verify-otp", {
        method: "POST", body: { verification_id: aadhaarVid, otp: aadhaarOtp },
      });
      setAadhaarName(res.name);
      setAadhaarMasked(res.masked);
      setAadhaarStage("verified");
    } catch (e: any) {
      setAadhaarErr(e.message || "Verification failed.");
    } finally { setLoadingA(false); }
  };

  const verifyPan = async () => {
    if (pan.length !== 10) {
      setPanErr("PAN must be 10 chars."); setPanStatus("err"); return;
    }
    setPanStatus("checking"); setPanErr("");
    try {
      const res = await api<{ valid: boolean; reason?: string; entity?: string; name?: string; dob?: string }>("/clients/verify-pan", {
        method: "POST", auth: false, body: { pan },
      });
      if (!res.valid) {
        setPanStatus("err"); setPanErr(res.reason || "Invalid PAN"); return;
      }
      setPanStatus("ok");
      setPanName(res.name || "");
      setPanDob(res.dob || "");
      setPanEntity(res.entity || "");
    } catch (e: any) {
      setPanStatus("err"); setPanErr(e.message || "Failed");
    }
  };

  const sendMobileOtp = async () => {
    setLoading(true);
    try {
      const res = await api<{ verification_id: string; demo_otp: string }>("/clients/send-otp", {
        method: "POST", body: { mobile },
      });
      setVid(res.verification_id); setDemoOtp(res.demo_otp);
      setStep("otp");
    } catch (e: any) {
      Alert.alert("Failed", e.message);
    } finally { setLoading(false); }
  };

  const finalizeSave = async () => {
    if (!vid || otp.length < 4) {
      Alert.alert("Enter OTP", "Please enter the mobile OTP."); return;
    }
    setLoading(true);
    try {
      await api("/clients/verify-otp", { method: "POST", body: { verification_id: vid, otp } });
      await api("/clients", {
        method: "POST",
        body: {
          name: name.trim(), mobile, aadhaar, pan,
          verification_id: vid,
          aadhaar_verification_id: aadhaarVid,
          aadhaar_name: aadhaarName,
          pan_name: panName,
          pan_dob: panDob,
        },
      });
      setStep("done");
    } catch (e: any) {
      Alert.alert("Failed", e.message);
    } finally { setLoading(false); }
  };

  const progressPct = step === "basic" ? 20 : step === "aadhaar" ? 45 : step === "pan" ? 65 : step === "otp" ? 85 : 100;

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <View style={styles.heroBar}>
          <TouchableOpacity testID="close-add-client" onPress={() => router.back()} style={styles.iconBtn}>
            <Ionicons name="close" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.heroTitle}>Add Client</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.heroBody}>
          <Text style={styles.heroSubtitle}>
            {step === "basic" ? "Step 1 · Basic details"
              : step === "aadhaar" ? "Step 2 · Aadhaar KYC"
              : step === "pan" ? "Step 3 · PAN KYC"
              : step === "otp" ? "Step 4 · Mobile verification"
              : "All done!"}
          </Text>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${progressPct}%` }]} />
          </View>
        </View>

        <ScrollView contentContainerStyle={{ padding: Spacing.lg, paddingBottom: Spacing.xxl }} keyboardShouldPersistTaps="handled">

          {step === "basic" && (
            <View style={styles.card}>
              <EmojiHero emoji="👋" title="Let's onboard your client" sub="Enter basic info. We'll handle the rest." />
              <Label text="Full name" />
              <Input testID="input-client-name" placeholder="e.g. Ravi Kumar" value={name} onChangeText={setName} autoCapitalize="words" />
              <Label text="Mobile number" mt />
              <View style={styles.mobileRow}>
                <View style={styles.prefix}><Text style={styles.prefixText}>+91</Text></View>
                <Input
                  testID="input-client-mobile" placeholder="10-digit mobile" keyboardType="number-pad"
                  value={mobile} onChangeText={(v) => setMobile(sanitizeDigits(v, 10))} maxLength={10}
                  style={{ flex: 1 }}
                />
              </View>
              <View style={{ height: Spacing.lg }} />
              <PrimaryButton testID="next-aadhaar" title="Continue to Aadhaar" disabled={!canProceedBasic} onPress={() => setStep("aadhaar")} />
            </View>
          )}

          {step === "aadhaar" && (
            <View style={styles.card}>
              <EmojiHero emoji="🪪" title="Verify Aadhaar" sub="We'll send an OTP to the registered mobile." tint={Colors.info} />

              {aadhaarStage === "input" && (
                <>
                  <Label text="Aadhaar number" />
                  <Input
                    testID="input-aadhaar" placeholder="XXXX XXXX XXXX" keyboardType="number-pad"
                    value={aadhaar} onChangeText={(v) => { setAadhaar(sanitizeDigits(v, 12)); setAadhaarErr(""); }}
                    maxLength={12}
                  />
                  {!!aadhaarErr && <StatusLine ok={false} msg={aadhaarErr} />}
                  <View style={{ height: Spacing.md }} />
                  <PrimaryButton testID="send-aadhaar-otp" title="Send Aadhaar OTP" loading={loadingA} disabled={aadhaar.length !== 12} onPress={sendAadhaarOtp} />
                </>
              )}

              {aadhaarStage === "otp" && (
                <>
                  <View style={styles.infoRow}>
                    <Ionicons name="shield-checkmark" size={18} color={Colors.info} />
                    <Text style={styles.infoText}>OTP sent for {aadhaarMasked}</Text>
                  </View>
                  {aadhaarDemoOtp && (
                    <View style={styles.demoBanner}>
                      <Ionicons name="bulb" size={16} color={Colors.secondary} />
                      <Text style={styles.demoText}>Demo OTP: <Text style={{ fontWeight: "800" }}>{aadhaarDemoOtp}</Text></Text>
                    </View>
                  )}
                  <Label text="Enter OTP" />
                  <Input
                    testID="input-aadhaar-otp" placeholder="6-digit OTP" keyboardType="number-pad"
                    value={aadhaarOtp} onChangeText={(v) => setAadhaarOtp(sanitizeDigits(v, 6))}
                    maxLength={6} style={{ letterSpacing: 6 }}
                  />
                  {!!aadhaarErr && <StatusLine ok={false} msg={aadhaarErr} />}
                  <View style={{ height: Spacing.md }} />
                  <PrimaryButton testID="verify-aadhaar-otp-btn" title="Verify Aadhaar" loading={loadingA} onPress={verifyAadhaarOtp} />
                  <TouchableOpacity onPress={sendAadhaarOtp} style={{ alignSelf: "center", marginTop: Spacing.sm }}>
                    <Text style={{ color: Colors.primary, fontWeight: "700" }}>Resend OTP</Text>
                  </TouchableOpacity>
                </>
              )}

              {aadhaarStage === "verified" && (
                <>
                  <View style={styles.verifiedBox}>
                    <View style={styles.verifiedTick}>
                      <Ionicons name="checkmark" size={22} color="#fff" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.verifiedLabel}>Aadhaar verified</Text>
                      <Text style={styles.verifiedValue}>{aadhaarName}</Text>
                      <Text style={styles.verifiedMasked}>{aadhaarMasked}</Text>
                    </View>
                  </View>
                  <View style={{ height: Spacing.md }} />
                  <PrimaryButton testID="next-pan" title="Continue to PAN" onPress={() => setStep("pan")} />
                  <View style={{ height: Spacing.sm }} />
                  <PrimaryButton title="Back" variant="secondary" onPress={() => setStep("basic")} />
                </>
              )}
            </View>
          )}

          {step === "pan" && (
            <View style={styles.card}>
              <EmojiHero emoji="📇" title="Verify PAN" sub="Enter PAN. We'll fetch registered name." tint={Colors.secondary} />

              <Label text="PAN number" />
              <Input
                testID="input-pan" placeholder="ABCDE1234F" autoCapitalize="characters"
                value={pan} onChangeText={(v) => { setPan(sanitizePan(v)); setPanStatus("idle"); setPanErr(""); }}
                maxLength={10}
              />
              {panStatus === "err" && <StatusLine ok={false} msg={panErr} />}

              {panStatus === "ok" && (
                <View style={styles.verifiedBox}>
                  <View style={[styles.verifiedTick, { backgroundColor: Colors.secondary }]}>
                    <Ionicons name="checkmark" size={22} color="#fff" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.verifiedLabel}>PAN verified · {panEntity}</Text>
                    <Text style={styles.verifiedValue}>{panName}</Text>
                    <Text style={styles.verifiedMasked}>DOB {panDob} · {pan}</Text>
                  </View>
                </View>
              )}

              <View style={{ height: Spacing.md }} />
              {panStatus !== "ok" ? (
                <PrimaryButton testID="verify-pan-btn" title="Verify PAN" loading={panStatus === "checking"} disabled={pan.length !== 10} onPress={verifyPan} />
              ) : (
                <>
                  <PrimaryButton testID="send-client-otp" title="Send client mobile OTP" loading={loading} onPress={sendMobileOtp} />
                  <View style={{ height: Spacing.sm }} />
                  <PrimaryButton title="Back" variant="secondary" onPress={() => setStep("aadhaar")} />
                </>
              )}
            </View>
          )}

          {step === "otp" && (
            <View style={styles.card}>
              <EmojiHero emoji="📱" title="Verify client mobile" sub={`OTP sent to +91 ${mobile}`} tint={Colors.success} />
              {demoOtp && (
                <View style={styles.demoBanner}>
                  <Ionicons name="bulb" size={16} color={Colors.secondary} />
                  <Text style={styles.demoText}>Demo OTP: <Text style={{ fontWeight: "800" }}>{demoOtp}</Text></Text>
                </View>
              )}
              <Label text="Enter OTP" />
              <Input
                testID="input-client-otp" placeholder="6-digit OTP" keyboardType="number-pad"
                value={otp} onChangeText={(v) => setOtp(sanitizeDigits(v, 6))}
                maxLength={6} style={{ letterSpacing: 6 }}
              />
              <View style={{ height: Spacing.md }} />
              <PrimaryButton testID="submit-client-btn" title="Verify & save client" loading={loading} onPress={finalizeSave} />
              <TouchableOpacity onPress={sendMobileOtp} style={{ alignSelf: "center", marginTop: Spacing.sm }}>
                <Text style={{ color: Colors.primary, fontWeight: "700" }}>Resend OTP</Text>
              </TouchableOpacity>
            </View>
          )}

          {step === "done" && (
            <View style={[styles.card, { alignItems: "center", paddingVertical: Spacing.xl }]}>
              <View style={styles.doneCircle}>
                <Ionicons name="checkmark" size={52} color="#fff" />
              </View>
              <Text style={styles.doneTitle}>{name} onboarded! 🎉</Text>
              <Text style={styles.doneSub}>
                Aadhaar, PAN and mobile number all verified. You&apos;re ready to raise loans for this client.
              </Text>
              <View style={{ height: Spacing.xl }} />
              <PrimaryButton testID="back-to-clients" title="View clients" onPress={() => router.replace("/(tabs)/clients")} />
            </View>
          )}

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Label({ text, mt }: { text: string; mt?: boolean }) {
  return <Text style={[styles.label, mt && { marginTop: Spacing.md }]}>{text}</Text>;
}

function StatusLine({ ok, msg }: { ok: boolean; msg: string }) {
  return (
    <View style={[styles.statusLine, { backgroundColor: (ok ? Colors.success : Colors.danger) + "15" }]}>
      <Ionicons name={ok ? "checkmark-circle" : "alert-circle"} size={14} color={ok ? Colors.success : Colors.danger} />
      <Text style={{ color: ok ? Colors.success : Colors.danger, fontSize: 12, fontWeight: "700" }}>{msg}</Text>
    </View>
  );
}

function EmojiHero({ emoji, title, sub, tint = Colors.primary }: { emoji: string; title: string; sub: string; tint?: string }) {
  return (
    <View style={{ alignItems: "center", marginBottom: Spacing.lg }}>
      <View style={[styles.emojiWrap, { backgroundColor: tint + "15" }]}>
        <Text style={{ fontSize: 44 }}>{emoji}</Text>
      </View>
      <Text style={styles.stepTitle}>{title}</Text>
      <Text style={styles.stepSub}>{sub}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  heroBar: {
    flexDirection: "row", alignItems: "center", paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm, backgroundColor: Colors.primary,
  },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  heroTitle: { flex: 1, textAlign: "center", fontSize: 18, fontWeight: "800", color: "#fff" },
  heroBody: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, backgroundColor: Colors.primary },
  heroSubtitle: { color: "#D9E7FF", fontSize: 13, marginBottom: Spacing.sm, fontWeight: "700" },
  progressBar: { height: 6, backgroundColor: "#ffffff25", borderRadius: 6, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: "#fff", borderRadius: 6 },
  card: { backgroundColor: Colors.surface, borderRadius: Radii.xl, padding: Spacing.lg, ...Shadows.card, marginTop: -Spacing.md },
  emojiWrap: { width: 88, height: 88, borderRadius: 44, alignItems: "center", justifyContent: "center" },
  stepTitle: { fontSize: 22, fontWeight: "800", color: Colors.textPrimary, marginTop: Spacing.sm },
  stepSub: { color: Colors.textSecondary, fontSize: 14, marginTop: 4, textAlign: "center" },
  label: { fontSize: 12, fontWeight: "700", color: Colors.textSecondary, letterSpacing: 0.5, marginBottom: 6 },
  mobileRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  prefix: {
    height: 54, paddingHorizontal: 14, borderRadius: Radii.md,
    borderWidth: 2, borderColor: Colors.border, backgroundColor: Colors.bgAlt, justifyContent: "center",
  },
  prefixText: { fontSize: 16, fontWeight: "700", color: Colors.textPrimary },
  statusLine: {
    marginTop: 8, flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 10, paddingVertical: 7, borderRadius: Radii.md, alignSelf: "flex-start",
  },
  demoBanner: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: Colors.secondary + "15", borderRadius: Radii.md,
    padding: 10, marginBottom: Spacing.md,
    borderWidth: 1, borderColor: Colors.secondary + "44",
  },
  demoText: { color: Colors.textPrimary, fontSize: 13 },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: Spacing.md },
  infoText: { color: Colors.textSecondary, fontSize: 13 },
  verifiedBox: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: Colors.success + "15", borderRadius: Radii.lg,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.success + "44",
    marginTop: Spacing.md,
  },
  verifiedTick: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.success,
    alignItems: "center", justifyContent: "center",
  },
  verifiedLabel: { fontSize: 11, color: Colors.success, fontWeight: "800", letterSpacing: 0.5 },
  verifiedValue: { fontSize: 17, fontWeight: "800", color: Colors.textPrimary, marginTop: 2 },
  verifiedMasked: { fontSize: 12, color: Colors.textSecondary, marginTop: 1 },
  doneCircle: {
    width: 100, height: 100, borderRadius: 50, backgroundColor: Colors.success,
    alignItems: "center", justifyContent: "center", ...Shadows.button,
  },
  doneTitle: { fontSize: 22, fontWeight: "800", color: Colors.textPrimary, marginTop: Spacing.lg, textAlign: "center" },
  doneSub: { color: Colors.textSecondary, marginTop: 8, textAlign: "center", lineHeight: 22, paddingHorizontal: Spacing.md },
});
