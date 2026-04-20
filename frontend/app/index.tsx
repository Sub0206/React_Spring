import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
  Image,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Input, PrimaryButton } from "../src/ui";
import { Colors, Radii, Shadows, Spacing } from "../src/theme";
import { useAuth } from "../src/auth";

export default function AuthScreen() {
  const { sendOtp, verifyOtp } = useAuth();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [step, setStep] = useState<"form" | "otp">("form");
  const [mobile, setMobile] = useState("");
  const [name, setName] = useState("");
  const [otp, setOtp] = useState("");
  const [demoOtp, setDemoOtp] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const sanitizeMobile = (v: string) => v.replace(/[^0-9]/g, "").slice(0, 10);

  const handleSendOtp = async () => {
    if (mobile.length !== 10) {
      Alert.alert("Invalid mobile", "Enter a 10-digit mobile number.");
      return;
    }
    if (mode === "signup" && !name.trim()) {
      Alert.alert("Name required", "Please enter your name to sign up.");
      return;
    }
    setLoading(true);
    try {
      const res = await sendOtp(mobile, mode, name.trim() || undefined);
      setDemoOtp(res?.demo_otp || null);
      setStep("otp");
    } catch (e: any) {
      Alert.alert("Couldn't send OTP", e.message || "Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (otp.length < 4) {
      Alert.alert("Enter OTP", "Please enter the 6-digit OTP.");
      return;
    }
    setLoading(true);
    try {
      await verifyOtp(mobile, otp);
    } catch (e: any) {
      Alert.alert("Verification failed", e.message || "Invalid OTP.");
    } finally {
      setLoading(false);
    }
  };

  const googleLogin = () => {
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    if (typeof window === "undefined") {
      Alert.alert("Google login", "Please use the web preview to sign in with Google.");
      return;
    }
    const redirectUrl = window.location.origin + "/";
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  const resetToForm = () => {
    setStep("form");
    setOtp("");
    setDemoOtp(null);
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.hero}>
            <View style={styles.logoWrap}>
              <Image
                source={{ uri: "https://static.prod-images.emergentagent.com/jobs/b97ea820-9246-4c66-95e8-0a7c3405dd9e/images/0374309247118c7aa2b0d747fd7062f80805f3c719877fcf47e47dbe4fac2348.png" }}
                style={{ width: 80, height: 80 }}
              />
            </View>
            <Text style={styles.title}>Lendify</Text>
            <Text style={styles.subtitle}>
              Smart lending, powered by AI.{"\n"}Review, score & fund loans in seconds.
            </Text>
          </View>

          <View style={styles.card}>
            {step === "form" ? (
              <>
                <View style={styles.tabs}>
                  <TouchableOpacity
                    testID="tab-login"
                    onPress={() => setMode("login")}
                    style={[styles.tab, mode === "login" && styles.tabActive]}
                  >
                    <Text style={[styles.tabText, mode === "login" && styles.tabTextActive]}>Sign in</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    testID="tab-signup"
                    onPress={() => setMode("signup")}
                    style={[styles.tab, mode === "signup" && styles.tabActive]}
                  >
                    <Text style={[styles.tabText, mode === "signup" && styles.tabTextActive]}>Sign up</Text>
                  </TouchableOpacity>
                </View>

                {mode === "signup" && (
                  <Input
                    testID="input-name"
                    placeholder="Full name"
                    value={name}
                    onChangeText={setName}
                    autoCapitalize="words"
                    style={{ marginBottom: Spacing.md }}
                  />
                )}

                <View style={styles.mobileRow}>
                  <View style={styles.prefix}><Text style={styles.prefixText}>+91</Text></View>
                  <Input
                    testID="input-mobile"
                    placeholder="10-digit mobile"
                    keyboardType="number-pad"
                    value={mobile}
                    onChangeText={(v) => setMobile(sanitizeMobile(v))}
                    maxLength={10}
                    style={{ flex: 1 }}
                  />
                </View>

                <View style={{ height: Spacing.md }} />

                <PrimaryButton
                  testID="send-otp-btn"
                  title={mode === "signup" ? "Sign up with OTP" : "Send OTP"}
                  onPress={handleSendOtp}
                  loading={loading}
                />

                <View style={styles.dividerRow}>
                  <View style={styles.line} />
                  <Text style={styles.or}>or</Text>
                  <View style={styles.line} />
                </View>

                <TouchableOpacity
                  testID="google-signin"
                  onPress={googleLogin}
                  style={styles.googleBtn}
                  activeOpacity={0.9}
                >
                  <Ionicons name="logo-google" size={20} color="#EA4335" />
                  <Text style={styles.googleText}>Continue with Google</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <View style={styles.otpHeader}>
                  <TouchableOpacity testID="back-to-form" onPress={resetToForm} style={styles.backChip}>
                    <Ionicons name="chevron-back" size={18} color={Colors.textPrimary} />
                  </TouchableOpacity>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.otpTitle}>Verify OTP</Text>
                    <Text style={styles.otpSub}>Sent to +91 {mobile}</Text>
                  </View>
                </View>

                {demoOtp && (
                  <View style={styles.demoBanner}>
                    <Ionicons name="bulb" size={16} color={Colors.secondary} />
                    <Text style={styles.demoText}>Demo OTP: <Text style={{ fontWeight: "800" }}>{demoOtp}</Text></Text>
                  </View>
                )}

                <Input
                  testID="input-otp"
                  placeholder="Enter 6-digit OTP"
                  keyboardType="number-pad"
                  value={otp}
                  onChangeText={(v) => setOtp(v.replace(/[^0-9]/g, "").slice(0, 6))}
                  maxLength={6}
                  style={{ marginBottom: Spacing.md, letterSpacing: 6 }}
                />

                <PrimaryButton
                  testID="verify-otp-btn"
                  title="Verify & continue"
                  onPress={handleVerifyOtp}
                  loading={loading}
                />

                <TouchableOpacity testID="resend-otp-btn" onPress={handleSendOtp} style={{ alignSelf: "center", marginTop: Spacing.md }}>
                  <Text style={{ color: Colors.primary, fontWeight: "700" }}>Resend OTP</Text>
                </TouchableOpacity>
              </>
            )}
          </View>

          <Text style={styles.footer}>
            By continuing, you agree to Lendify&apos;s Terms & Privacy Policy.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  scroll: { padding: Spacing.lg, paddingBottom: Spacing.xxl },
  hero: { alignItems: "center", marginTop: Spacing.lg, marginBottom: Spacing.lg },
  logoWrap: {
    width: 100, height: 100, borderRadius: 30, backgroundColor: Colors.surface,
    alignItems: "center", justifyContent: "center", marginBottom: Spacing.md, ...Shadows.card,
  },
  title: { fontSize: 34, fontWeight: "800", color: Colors.textPrimary, letterSpacing: -0.5 },
  subtitle: { fontSize: 15, color: Colors.textSecondary, textAlign: "center", marginTop: 6, lineHeight: 22 },
  card: { backgroundColor: Colors.surface, borderRadius: Radii.xl, padding: Spacing.lg, marginTop: Spacing.md, ...Shadows.card },
  tabs: { flexDirection: "row", backgroundColor: Colors.bgAlt, borderRadius: Radii.pill, padding: 4, marginBottom: Spacing.lg },
  tab: { flex: 1, paddingVertical: 10, borderRadius: Radii.pill, alignItems: "center" },
  tabActive: { backgroundColor: Colors.surface, ...Shadows.card },
  tabText: { color: Colors.textSecondary, fontWeight: "700", fontSize: 14 },
  tabTextActive: { color: Colors.primary },
  mobileRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  prefix: {
    height: 54, paddingHorizontal: 14, borderRadius: Radii.md,
    borderWidth: 2, borderColor: Colors.border, backgroundColor: Colors.bgAlt,
    justifyContent: "center",
  },
  prefixText: { fontSize: 16, fontWeight: "700", color: Colors.textPrimary },
  dividerRow: { flexDirection: "row", alignItems: "center", marginVertical: Spacing.md },
  line: { flex: 1, height: 1, backgroundColor: Colors.borderLight },
  or: { marginHorizontal: 12, color: Colors.textMuted, fontSize: 12, fontWeight: "600" },
  googleBtn: {
    height: 54, borderRadius: Radii.pill, borderWidth: 2, borderColor: Colors.border,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    backgroundColor: Colors.surface,
  },
  googleText: { fontSize: 16, fontWeight: "700", color: Colors.textPrimary },
  footer: { textAlign: "center", color: Colors.textMuted, fontSize: 12, marginTop: Spacing.lg },
  otpHeader: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: Spacing.md },
  backChip: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.bgAlt, alignItems: "center", justifyContent: "center",
  },
  otpTitle: { fontSize: 20, fontWeight: "800", color: Colors.textPrimary },
  otpSub: { color: Colors.textSecondary, fontSize: 13, marginTop: 2 },
  demoBanner: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: Colors.secondary + "15", borderRadius: Radii.md,
    padding: 10, marginBottom: Spacing.md,
    borderWidth: 1, borderColor: Colors.secondary + "44",
  },
  demoText: { color: Colors.textPrimary, fontSize: 13 },
});
