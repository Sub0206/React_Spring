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
  const { login, register } = useAuth();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!email || !password || (mode === "signup" && !name)) {
      Alert.alert("Missing info", "Please fill all required fields.");
      return;
    }
    setLoading(true);
    try {
      if (mode === "login") await login(email.trim(), password);
      else await register(email.trim(), password, name.trim());
    } catch (e: any) {
      Alert.alert("Authentication failed", e.message || "Unable to sign in");
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

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
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
            <Input
              testID="input-email"
              placeholder="Email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              style={{ marginBottom: Spacing.md }}
            />
            <Input
              testID="input-password"
              placeholder="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              style={{ marginBottom: Spacing.lg }}
            />

            <PrimaryButton
              testID="submit-auth"
              title={mode === "login" ? "Sign in" : "Create account"}
              onPress={submit}
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
  card: {
    backgroundColor: Colors.surface, borderRadius: Radii.xl,
    padding: Spacing.lg, marginTop: Spacing.md, ...Shadows.card,
  },
  tabs: {
    flexDirection: "row", backgroundColor: Colors.bgAlt, borderRadius: Radii.pill,
    padding: 4, marginBottom: Spacing.lg,
  },
  tab: { flex: 1, paddingVertical: 10, borderRadius: Radii.pill, alignItems: "center" },
  tabActive: { backgroundColor: Colors.surface, ...Shadows.card },
  tabText: { color: Colors.textSecondary, fontWeight: "700", fontSize: 14 },
  tabTextActive: { color: Colors.primary },
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
});
