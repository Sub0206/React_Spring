import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert, Animated, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Radii, Shadows, Spacing } from "../src/theme";
import { PrimaryButton } from "../src/ui";
import {
  hasPasscode, setPasscode, verifyPasscode, isBiometricAvailable, biometricEnabled,
  promptBiometric, setBiometricEnabled,
} from "../src/passcode";
import { useAuth } from "../src/auth";
import { markSessionUnlocked } from "../src/passcode";
import { useThemedStyles } from "../src/themeContext";

type Mode = "verify" | "create" | "confirm";

export default function PasscodeScreen() {
  const styles = useScreenStyles();
  const router = useRouter();
  const params = useLocalSearchParams<{ mode?: string; redirect?: string }>();
  const { logout } = useAuth();
  const initialMode: Mode = (params.mode as Mode) || "verify";

  const [mode, setMode] = useState<Mode>(initialMode);
  const [code, setCode] = useState("");
  const [firstCode, setFirstCode] = useState("");  // stored between create → confirm
  const [status, setStatus] = useState<{ kind: "idle" | "err" | "ok"; msg?: string }>({ kind: "idle" });
  const [lockUntil, setLockUntil] = useState<number>(0);
  const [bio, setBio] = useState<{ ok: boolean; enabled: boolean; name: string } | null>(null);
  const shake = useRef(new Animated.Value(0)).current;
  const hiddenRef = useRef<TextInput>(null);

  // Load biometric availability (for verify mode only)
  useEffect(() => {
    (async () => {
      if (mode !== "verify") return;
      const avail = await isBiometricAvailable();
      const en = await biometricEnabled();
      setBio({ ok: avail.hasHardware && avail.isEnrolled, enabled: en, name: avail.types[0] || "Biometric" });
      // Auto-trigger biometric if enabled
      if (avail.hasHardware && avail.isEnrolled && en) {
        setTimeout(() => { void tryBiometric(); }, 350);
      }
    })();
  }, [mode]);

  // Lock countdown
  useEffect(() => {
    if (!lockUntil) return;
    const t = setInterval(() => {
      if (Date.now() >= lockUntil) {
        setLockUntil(0);
        setStatus({ kind: "idle" });
        clearInterval(t);
      } else {
        setStatus({ kind: "err", msg: `Too many attempts. Try again in ${Math.ceil((lockUntil - Date.now()) / 1000)}s.` });
      }
    }, 500);
    return () => clearInterval(t);
  }, [lockUntil]);

  // Focus hidden input
  useEffect(() => { setTimeout(() => hiddenRef.current?.focus(), 200); }, [mode]);

  const shakeBox = () => {
    Animated.sequence([
      Animated.timing(shake, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shake, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 8, duration: 50, useNativeDriver: true }),
      Animated.timing(shake, { toValue: -8, duration: 50, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  };

  const onChange = (v: string) => {
    const digits = v.replace(/[^0-9]/g, "").slice(0, 4);
    setCode(digits);
    if (status.kind === "err") setStatus({ kind: "idle" });
  };

  const submit = useCallback(async () => {
    if (code.length !== 4) return;
    if (mode === "create") {
      setFirstCode(code);
      setCode("");
      setMode("confirm");
      setStatus({ kind: "idle" });
      return;
    }
    if (mode === "confirm") {
      if (code !== firstCode) {
        setStatus({ kind: "err", msg: "Passcodes don't match. Try again." });
        setCode("");
        setFirstCode("");
        setMode("create");
        shakeBox();
        return;
      }
      try {
        await setPasscode(code);
        setStatus({ kind: "ok", msg: "Passcode set ✓" });
        setTimeout(() => router.replace((params.redirect as any) || "/(tabs)/dashboard"), 400);
      } catch (e: any) {
        Alert.alert("Error", e.message);
      }
      return;
    }
    // verify
    const r = await verifyPasscode(code);
    if (r.ok) {
      markSessionUnlocked();
      router.replace((params.redirect as any) || "/(tabs)/dashboard");
    } else if (r.error === "locked") {
      setLockUntil(r.unlockAt || Date.now() + 30_000);
      setCode("");
      shakeBox();
    } else {
      setStatus({
        kind: "err",
        msg: typeof r.attemptsLeft === "number" ? `Wrong passcode. ${r.attemptsLeft} attempts left.` : "Wrong passcode.",
      });
      setCode("");
      shakeBox();
    }
  }, [code, mode, firstCode, router, params.redirect, shake]);

  // Auto-submit on 4 digits
  useEffect(() => { if (code.length === 4) submit(); /* eslint-disable-next-line */ }, [code]);

  const tryBiometric = async () => {
    const ok = await promptBiometric("Unlock LendIQ");
    if (ok) {
      markSessionUnlocked();
      router.replace((params.redirect as any) || "/(tabs)/dashboard");
    }
  };

  const onForgot = () => {
    Alert.alert(
      "Forgot passcode?",
      "Sign out and verify with OTP again. You'll be asked to create a new passcode.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign out",
          style: "destructive",
          onPress: async () => {
            await setBiometricEnabled(false);
            // We intentionally keep the stored hash in case user remembers — but you
            // can optionally clear it here. We just logout and send back to OTP.
            await logout();
            router.replace("/");
          },
        },
      ],
    );
  };

  const title = mode === "verify" ? "Enter passcode" : mode === "create" ? "Create passcode" : "Confirm passcode";
  const subtitle =
    mode === "verify"   ? "Please enter a valid passcode to enter the app"
    : mode === "create" ? "Set a 4-digit passcode for faster secure access"
                        : "Re-enter your passcode to confirm";

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.top}>
        {mode === "verify" && (
          <TouchableOpacity testID="logout-btn" onPress={onForgot} style={styles.logoutBtn}>
            <Ionicons name="log-out-outline" size={22} color={Colors.textPrimary} />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.content}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>

        <Animated.View style={[styles.boxesRow, { transform: [{ translateX: shake }] }]}>
          {[0, 1, 2, 3].map((i) => {
            const filled = i < code.length;
            const err = status.kind === "err";
            return (
              <View
                key={i}
                testID={`pass-box-${i}`}
                style={[
                  styles.box,
                  filled && styles.boxFilled,
                  err && styles.boxErr,
                ]}
              >
                {filled && <View style={[styles.dot, err && { backgroundColor: Colors.danger }]} />}
              </View>
            );
          })}
        </Animated.View>

        {/* Hidden input that captures digits (works on all platforms incl. web) */}
        <TextInput
          ref={hiddenRef}
          testID="pass-input"
          value={code}
          onChangeText={onChange}
          keyboardType={Platform.OS === "ios" ? "number-pad" : "numeric"}
          maxLength={4}
          secureTextEntry
          style={styles.hiddenInput}
          autoFocus
          caretHidden
        />

        {mode === "verify" && (
          <TouchableOpacity testID="forgot-btn" onPress={onForgot} style={{ marginTop: 18 }}>
            <Text style={styles.forgotLink}>Forgot Passcode?</Text>
          </TouchableOpacity>
        )}

        {status.kind === "err" && (
          <Text style={styles.errMsg}>{status.msg}</Text>
        )}
        {status.kind === "ok" && (
          <Text style={styles.okMsg}>{status.msg}</Text>
        )}

        {/* Biometric entry point */}
        {mode === "verify" && bio?.ok && bio.enabled && (
          <TouchableOpacity testID="bio-btn" onPress={tryBiometric} style={styles.bioBtn} activeOpacity={0.8}>
            <Ionicons name="finger-print" size={44} color={Colors.primary} />
            <Text style={styles.bioTxt}>Continue with {bio.name}</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.footer}>
        <PrimaryButton
          testID="verify-btn"
          title={mode === "verify" ? "Verify" : mode === "create" ? "Next" : "Confirm"}
          disabled={code.length !== 4 || !!lockUntil}
          onPress={submit}
        />
      </View>
    </SafeAreaView>
  );
}

function useScreenStyles() {
  return useThemedStyles(() => StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  top: { flexDirection: "row", justifyContent: "flex-end", paddingHorizontal: Spacing.md, paddingTop: Spacing.sm },
  logoutBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.surface, alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: Colors.borderLight, ...Shadows.card,
  },
  content: { flex: 1, paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg },
  title: { fontSize: 30, fontWeight: "800", color: Colors.textPrimary, letterSpacing: -0.6 },
  subtitle: { marginTop: 8, color: Colors.textSecondary, fontSize: 13, lineHeight: 20 },

  boxesRow: { flexDirection: "row", gap: 14, marginTop: Spacing.xl },
  box: {
    width: 56, height: 60, borderRadius: 10,
    backgroundColor: Colors.surface,
    borderWidth: 1, borderColor: Colors.borderLight,
    alignItems: "center", justifyContent: "center",
  },
  boxFilled: { borderColor: Colors.primary },
  boxErr: { borderColor: Colors.danger, backgroundColor: Colors.danger + "10" },
  dot: { width: 14, height: 14, borderRadius: 7, backgroundColor: Colors.primary },

  hiddenInput: { position: "absolute", width: 1, height: 1, opacity: 0 },

  forgotLink: { color: Colors.primary, fontWeight: "800", fontSize: 14 },
  errMsg: { marginTop: 14, color: Colors.danger, fontSize: 13, fontWeight: "700" },
  okMsg:  { marginTop: 14, color: Colors.success, fontSize: 13, fontWeight: "800" },

  bioBtn: {
    marginTop: Spacing.xl, alignSelf: "center", alignItems: "center", padding: 10,
  },
  bioTxt: { marginTop: 8, color: Colors.primary, fontWeight: "800", fontSize: 14 },

  footer: { padding: Spacing.lg, paddingBottom: Spacing.xl },
  }));
}

