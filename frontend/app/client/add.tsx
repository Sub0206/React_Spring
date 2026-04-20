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

type Step = "basic" | "address" | "aadhaar" | "pan" | "done";

export default function AddClient() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("basic");

  // Basic
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");

  // Address
  const [line1, setLine1] = useState("");
  const [line2, setLine2] = useState("");
  const [city, setCity] = useState("");
  const [stateName, setStateName] = useState("");
  const [pincode, setPincode] = useState("");

  // Aadhaar (simplified: just validate, no OTP)
  const [aadhaar, setAadhaar] = useState("");
  const [aadhaarStatus, setAadhaarStatus] = useState<"idle" | "checking" | "ok" | "err">("idle");
  const [aadhaarName, setAadhaarName] = useState("");
  const [aadhaarMasked, setAadhaarMasked] = useState("");
  const [aadhaarErr, setAadhaarErr] = useState("");

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

  const verifyAadhaar = async () => {
    if (aadhaar.length !== 12) {
      setAadhaarStatus("err"); setAadhaarErr("Aadhaar must be 12 digits."); return;
    }
    setAadhaarStatus("checking"); setAadhaarErr("");
    try {
      const res = await api<{ valid: boolean; reason?: string; masked?: string; name?: string }>("/clients/verify-aadhaar", {
        method: "POST", auth: false, body: { aadhaar },
      });
      if (!res.valid) {
        setAadhaarStatus("err"); setAadhaarErr(res.reason || "Invalid Aadhaar"); return;
      }
      setAadhaarStatus("ok");
      setAadhaarName(res.name || "");
      setAadhaarMasked(res.masked || "");
    } catch (e: any) {
      setAadhaarStatus("err"); setAadhaarErr(e.message || "Failed");
    }
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
    setLoading(true);
    try {
      await api("/clients", {
        method: "POST",
        body: {
          name: name.trim(), mobile, aadhaar, pan,
          aadhaar_name: aadhaarName,
          pan_name: panName,
          pan_dob: panDob,
          address_line1: line1.trim() || undefined,
          address_line2: line2.trim() || undefined,
          city: city.trim() || undefined,
          state: stateName.trim() || undefined,
          pincode: pincode.trim() || undefined,
        },
      });
      setStep("done");
    } catch (e: any) {
      Alert.alert("Failed", e.message);
    } finally { setLoading(false); }
  };

  const progressPct = step === "basic" ? 20 : step === "address" ? 40 : step === "aadhaar" ? 65 : step === "pan" ? 90 : 100;

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
              : step === "address" ? "Step 2 · Address"
              : step === "aadhaar" ? "Step 3 · Aadhaar KYC"
              : step === "pan" ? "Step 4 · PAN KYC"
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
              <PrimaryButton testID="next-address" title="Continue" disabled={!canProceedBasic} onPress={() => setStep("address")} />
            </View>
          )}

          {step === "address" && (
            <View style={styles.card}>
              <EmojiHero emoji="🏠" title="Client address" sub="Residence on file for KYC." tint={Colors.secondary} />
              <Label text="Address line 1" />
              <Input testID="input-line1" placeholder="House / flat / street" value={line1} onChangeText={setLine1} />
              <Label text="Address line 2 (optional)" mt />
              <Input testID="input-line2" placeholder="Area / landmark" value={line2} onChangeText={setLine2} />
              <View style={{ flexDirection: "row", gap: Spacing.sm, marginTop: Spacing.md }}>
                <View style={{ flex: 1 }}>
                  <Label text="City" />
                  <Input testID="input-city" placeholder="Mumbai" value={city} onChangeText={setCity} />
                </View>
                <View style={{ flex: 1 }}>
                  <Label text="State" />
                  <Input testID="input-state" placeholder="Maharashtra" value={stateName} onChangeText={setStateName} />
                </View>
              </View>
              <Label text="Pincode" mt />
              <Input testID="input-pincode" placeholder="400001" keyboardType="number-pad"
                value={pincode} onChangeText={(v) => setPincode(sanitizeDigits(v, 6))} maxLength={6} />
              <View style={{ height: Spacing.lg }} />
              <PrimaryButton testID="next-aadhaar" title="Continue"
                disabled={!(line1.trim() && city.trim() && stateName.trim() && pincode.length === 6)}
                onPress={() => setStep("aadhaar")} />
              <View style={{ height: Spacing.sm }} />
              <PrimaryButton title="Back" variant="secondary" onPress={() => setStep("basic")} />
            </View>
          )}

          {step === "aadhaar" && (
            <View style={styles.card}>
              <EmojiHero emoji="🪪" title="Verify Aadhaar" sub="Enter Aadhaar number — we'll fetch registered name." tint={Colors.info} />

              <Label text="Aadhaar number" />
              <Input
                testID="input-aadhaar" placeholder="XXXX XXXX XXXX" keyboardType="number-pad"
                value={aadhaar} onChangeText={(v) => { setAadhaar(sanitizeDigits(v, 12)); setAadhaarStatus("idle"); setAadhaarErr(""); }}
                maxLength={12}
              />
              {aadhaarStatus === "err" && <StatusLine ok={false} msg={aadhaarErr} />}

              {aadhaarStatus === "ok" && (
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
              )}

              <View style={{ height: Spacing.md }} />
              {aadhaarStatus !== "ok" ? (
                <PrimaryButton testID="verify-aadhaar-btn" title="Verify Aadhaar"
                  loading={aadhaarStatus === "checking"} disabled={aadhaar.length !== 12} onPress={verifyAadhaar} />
              ) : (
                <>
                  <PrimaryButton testID="next-pan" title="Continue to PAN" onPress={() => setStep("pan")} />
                  <View style={{ height: Spacing.sm }} />
                  <PrimaryButton title="Back" variant="secondary" onPress={() => setStep("address")} />
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
                  <PrimaryButton testID="submit-client-btn" title="Save client" loading={loading} onPress={finalizeSave} />
                  <View style={{ height: Spacing.sm }} />
                  <PrimaryButton title="Back" variant="secondary" onPress={() => setStep("aadhaar")} />
                </>
              )}
            </View>
          )}

          {step === "done" && (
            <View style={[styles.card, { alignItems: "center", paddingVertical: Spacing.xl }]}>
              <View style={styles.doneCircle}>
                <Ionicons name="checkmark" size={52} color="#fff" />
              </View>
              <Text style={styles.doneTitle}>{name} onboarded! 🎉</Text>
              <Text style={styles.doneSub}>
                Aadhaar and PAN verified. You&apos;re ready to raise loans for this client.
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
