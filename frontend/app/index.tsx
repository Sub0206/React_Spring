import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Input, PrimaryButton } from "../src/ui";
import { Colors, Radii, Shadows, Spacing, Brand } from "../src/theme";
import { useAuth } from "../src/auth";
import { useThemedStyles } from "../src/themeContext";

/**
 * OTP-ONLY AUTH (2026-05-03).
 *
 *   Step 1 \u2014 Mobile entry (+ name if signing up).
 *   Step 2 \u2014 OTP entry (6 digits).
 *   \u2192 POST /auth/verify-otp \u2192 JWT stored (30 days) \u2192 /dashboard.
 *
 * No passcode, no biometric. Expired/invalid token \u2192 back to this screen.
 */
type Step = "mobile" | "otp";
type Intent = "login" | "signup";

export default function AuthScreen() {
  const styles = useScreenStyles();
  const { sendOtp, verifyOtp } = useAuth();
  const router = useRouter();

  const [intent, setIntent] = useState<Intent>("login");
  const [step, setStep] = useState<Step>("mobile");
  const [mobile, setMobile] = useState("");
  const [name, setName] = useState("");
  const [otp, setOtp] = useState("");
  const [demoOtp, setDemoOtp] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const sanitizeMobile = (v: string) => v.replace(/[^0-9]/g, "").slice(0, 10);

  // ---------- Step 1: Send OTP ----------
  const handleSendOtp = async () => {
    if (mobile.length !== 10) {
      Alert.alert("Invalid mobile", "Enter a 10-digit mobile number.");
      return;
    }
    if (intent === "signup" && !name.trim()) {
      Alert.alert("Name required", "Please enter your name to sign up.");
      return;
    }
    setBusy(true);
    try {
      const res = await sendOtp(mobile, intent, intent === "signup" ? name.trim() : undefined);
      setDemoOtp(res?.demo_otp || null);
      setStep("otp");
    } catch (e: any) {
      Alert.alert("Couldn't send OTP", e?.message || "Please try again.");
    } finally {
      setBusy(false);
    }
  };

  // ---------- Step 2: Verify OTP ----------
  const handleVerifyOtp = async () => {
    if (otp.length < 4) {
      Alert.alert("Enter OTP", "Please enter the 6-digit OTP.");
      return;
    }
    setBusy(true);
    try {
      const user = await verifyOtp(mobile, otp);
      if (!user.subscription_status) {
        router.replace("/subscribe");
      } else {
        router.replace("/(tabs)/dashboard");
      }
    } catch (e: any) {
      Alert.alert("Verification failed", e?.message || "Invalid OTP.");
    } finally {
      setBusy(false);
    }
  };

  const resetToMobile = () => {
    setStep("mobile");
    setOtp("");
    setDemoOtp(null);
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.hero}>
            <View style={styles.logoWrap}>
              <Text style={styles.logoText}>LQ</Text>
            </View>
            <Text style={styles.title}>{Brand.name}</Text>
            <Text style={styles.powered}>{Brand.tagline}</Text>
            <Text style={styles.subtitle}>
              Smart lending, powered by AI.{"\n"}Review, score & fund loans in seconds.
            </Text>
          </View>

          <View style={styles.card}>
            {step === "mobile" ? (
              <>
                <View style={styles.tabs}>
                  <TouchableOpacity
                    testID="tab-login"
                    onPress={() => setIntent("login")}
                    style={[styles.tab, intent === "login" && styles.tabActive]}
                  >
                    <Text style={[styles.tabText, intent === "login" && styles.tabTextActive]}>
                      Sign in
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    testID="tab-signup"
                    onPress={() => setIntent("signup")}
                    style={[styles.tab, intent === "signup" && styles.tabActive]}
                  >
                    <Text style={[styles.tabText, intent === "signup" && styles.tabTextActive]}>
                      Sign up
                    </Text>
                  </TouchableOpacity>
                </View>

                {intent === "signup" && (
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
                  <View style={styles.prefix}>
                    <Text style={styles.prefixText}>+91</Text>
                  </View>
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
                  testID="continue-btn"
                  title="Send OTP"
                  onPress={handleSendOtp}
                  loading={busy}
                />

                <Text style={styles.helper}>
                  We&apos;ll send a 6-digit OTP to verify your number. Valid for 5 minutes.
                </Text>
              </>
            ) : (
              <>
                <View style={styles.otpHeader}>
                  <TouchableOpacity
                    testID="back-to-form"
                    onPress={resetToMobile}
                    style={styles.backChip}
                  >
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
                    <Text style={styles.demoText}>
                      Demo OTP: <Text style={{ fontWeight: "800" }}>{demoOtp}</Text>
                    </Text>
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
                  loading={busy}
                />

                <TouchableOpacity
                  testID="resend-otp-btn"
                  onPress={handleSendOtp}
                  style={{ alignSelf: "center", marginTop: Spacing.md }}
                >
                  <Text style={{ color: Colors.primary, fontWeight: "700" }}>Resend OTP</Text>
                </TouchableOpacity>
              </>
            )}
          </View>

          <Text style={styles.footer}>
            By continuing, you agree to LendIQ&apos;s Terms & Privacy Policy.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function useScreenStyles() {
  return useThemedStyles(() =>
    StyleSheet.create({
      safe: { flex: 1, backgroundColor: Colors.bg },
      scroll: { padding: Spacing.lg, paddingBottom: Spacing.xxl },
      hero: { alignItems: "center", marginTop: Spacing.lg, marginBottom: Spacing.lg },
      logoWrap: {
        width: 90,
        height: 90,
        borderRadius: 24,
        backgroundColor: Colors.primary,
        alignItems: "center",
        justifyContent: "center",
        marginBottom: Spacing.md,
        ...Shadows.button,
      },
      logoText: { color: "#fff", fontSize: 34, fontWeight: "800", letterSpacing: -1 },
      title: {
        fontSize: 38,
        fontWeight: "800",
        color: Colors.textPrimary,
        letterSpacing: -1,
      },
      powered: {
        fontSize: 11,
        color: Colors.textMuted,
        fontWeight: "700",
        letterSpacing: 1.5,
        marginTop: 2,
      },
      subtitle: {
        fontSize: 15,
        color: Colors.textSecondary,
        textAlign: "center",
        marginTop: 6,
        lineHeight: 22,
      },
      card: {
        backgroundColor: Colors.surface,
        borderRadius: Radii.xl,
        padding: Spacing.lg,
        marginTop: Spacing.md,
        ...Shadows.card,
      },
      tabs: {
        flexDirection: "row",
        backgroundColor: Colors.bgAlt,
        borderRadius: Radii.pill,
        padding: 4,
        marginBottom: Spacing.lg,
      },
      tab: { flex: 1, paddingVertical: 10, borderRadius: Radii.pill, alignItems: "center" },
      tabActive: { backgroundColor: Colors.surface, ...Shadows.card },
      tabText: { color: Colors.textSecondary, fontWeight: "700", fontSize: 14 },
      tabTextActive: { color: Colors.primary },
      mobileRow: { flexDirection: "row", gap: 8, alignItems: "center" },
      prefix: {
        height: 54,
        paddingHorizontal: 14,
        borderRadius: Radii.md,
        borderWidth: 2,
        borderColor: Colors.border,
        backgroundColor: Colors.bgAlt,
        justifyContent: "center",
      },
      prefixText: { fontSize: 16, fontWeight: "700", color: Colors.textPrimary },
      helper: {
        marginTop: Spacing.md,
        color: Colors.textMuted,
        fontSize: 12,
        textAlign: "center",
        lineHeight: 18,
      },
      footer: {
        textAlign: "center",
        color: Colors.textMuted,
        fontSize: 12,
        marginTop: Spacing.lg,
      },
      otpHeader: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        marginBottom: Spacing.md,
      },
      backChip: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: Colors.bgAlt,
        alignItems: "center",
        justifyContent: "center",
      },
      otpTitle: { fontSize: 20, fontWeight: "800", color: Colors.textPrimary },
      otpSub: { color: Colors.textSecondary, fontSize: 13, marginTop: 2 },
      demoBanner: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        backgroundColor: Colors.secondary + "15",
        borderRadius: Radii.md,
        padding: 10,
        marginBottom: Spacing.md,
        borderWidth: 1,
        borderColor: Colors.secondary + "44",
      },
      demoText: { color: Colors.textPrimary, fontSize: 13 },
    })
  );
}
