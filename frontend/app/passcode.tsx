import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  Animated,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Radii, Shadows, Spacing } from "../src/theme";
import { PrimaryButton } from "../src/ui";
import {
  setServerPasscode,
  verifyServerPasscode,
  markSessionUnlocked,
} from "../src/passcode";
import { useAuth } from "../src/auth";
import { useThemedStyles } from "../src/themeContext";

/**
 * Passcode screen — server-driven (no biometric).
 *
 * Modes:
 *   - "login":   public; user just entered their mobile and the system found
 *                a server-side passcode for it. We POST /auth/passcode-login
 *                to mint a JWT.
 *   - "create":  authenticated; first-time user just verified OTP and is being
 *                asked to set a 4-digit passcode → POST /auth/set-passcode.
 *   - "confirm": internal step after "create" — re-enter to confirm.
 *   - "verify":  authenticated in-session resume lock (background→foreground).
 *                POSTs /auth/verify-passcode (no new token issued).
 *   - "reset":   forgot-passcode flow; user got a fresh OTP (purpose=reset).
 *                POST /auth/reset-passcode.
 *
 * Query params:
 *   - mode    — one of the above (defaults to "verify")
 *   - mobile  — required for login/reset modes
 *   - otp     — required for reset mode (already verified server-side)
 *   - redirect — optional path to navigate to on success
 */
type Mode = "login" | "create" | "confirm" | "verify" | "reset";

export default function PasscodeScreen() {
  const styles = useScreenStyles();
  const router = useRouter();
  const params = useLocalSearchParams<{
    mode?: string;
    mobile?: string;
    otp?: string;
    redirect?: string;
  }>();
  const { logout, passcodeLogin, resetPasscode, refresh } = useAuth();
  const initialMode: Mode = (params.mode as Mode) || "verify";
  const mobile = (params.mobile as string) || "";
  const resetOtp = (params.otp as string) || "";

  const [mode, setMode] = useState<Mode>(initialMode);
  const [code, setCode] = useState("");
  const [firstCode, setFirstCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ kind: "idle" | "err" | "ok"; msg?: string }>({
    kind: "idle",
  });
  const shake = useRef(new Animated.Value(0)).current;
  const hiddenRef = useRef<TextInput>(null);

  useEffect(() => {
    setTimeout(() => hiddenRef.current?.focus(), 180);
  }, [mode]);

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
    if (busy) return;
    if (code.length !== 4) return;

    // ---- create flow: collect first code, advance to confirm ----
    if (mode === "create") {
      setFirstCode(code);
      setCode("");
      setMode("confirm");
      setStatus({ kind: "idle" });
      return;
    }

    // ---- confirm flow: must equal firstCode, then call set-passcode ----
    if (mode === "confirm") {
      if (code !== firstCode) {
        setStatus({ kind: "err", msg: "Passcodes don't match. Try again." });
        setCode("");
        setFirstCode("");
        setMode("create");
        shakeBox();
        return;
      }
      setBusy(true);
      try {
        await setServerPasscode(code);
        setStatus({ kind: "ok", msg: "Passcode set ✓" });
        markSessionUnlocked();
        // Refresh user — forces AuthGate to re-evaluate has-passcode and clear
        // its mustCreatePasscode flag so the upcoming router.replace sticks.
        await refresh();
        setTimeout(
          () => router.replace((params.redirect as any) || "/(tabs)/dashboard"),
          400
        );
      } catch (e: any) {
        setBusy(false);
        Alert.alert("Couldn't set passcode", e.message || "Please try again.");
      }
      return;
    }

    // ---- login flow (public): mobile + passcode → token ----
    if (mode === "login") {
      if (!mobile) {
        Alert.alert("Missing mobile", "Please go back and enter your mobile.");
        return;
      }
      setBusy(true);
      try {
        await passcodeLogin(mobile, code);
        // passcodeLogin marks session unlocked internally
        router.replace((params.redirect as any) || "/(tabs)/dashboard");
      } catch (e: any) {
        setBusy(false);
        setStatus({ kind: "err", msg: e.message || "Invalid passcode." });
        setCode("");
        shakeBox();
      }
      return;
    }

    // ---- reset flow: mobile + reset OTP + new passcode ----
    if (mode === "reset") {
      if (!firstCode) {
        // First entry — capture and ask to confirm
        setFirstCode(code);
        setCode("");
        setStatus({ kind: "idle" });
        return;
      }
      // Second entry — confirm matches
      if (code !== firstCode) {
        setStatus({ kind: "err", msg: "Passcodes don't match. Try again." });
        setCode("");
        setFirstCode("");
        shakeBox();
        return;
      }
      setBusy(true);
      try {
        await resetPasscode(mobile, resetOtp, code);
        setStatus({ kind: "ok", msg: "Passcode updated ✓" });
        setTimeout(() => router.replace("/(tabs)/dashboard"), 400);
      } catch (e: any) {
        setBusy(false);
        setStatus({ kind: "err", msg: e.message || "Reset failed." });
        setCode("");
        setFirstCode("");
        shakeBox();
      }
      return;
    }

    // ---- verify flow (in-session resume lock) ----
    setBusy(true);
    const ok = await verifyServerPasscode(code);
    setBusy(false);
    if (ok) {
      markSessionUnlocked();
      router.replace((params.redirect as any) || "/(tabs)/dashboard");
    } else {
      setStatus({ kind: "err", msg: "Wrong passcode." });
      setCode("");
      shakeBox();
    }
  }, [
    busy,
    code,
    mode,
    firstCode,
    mobile,
    resetOtp,
    passcodeLogin,
    resetPasscode,
    router,
    params.redirect,
  ]);

  // Auto-submit on 4 digits (only for non-create steps to avoid premature advance)
  useEffect(() => {
    if (code.length === 4) submit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  const onForgot = () => {
    Alert.alert(
      "Forgot passcode?",
      "We'll send an OTP to your registered mobile so you can set a new passcode.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Continue",
          onPress: async () => {
            // For "verify" mode the user is logged in — we logout first so the
            // login screen owns the reset flow. The login screen reads the
            // `?reset=<mobile>` query param and immediately starts a reset OTP.
            await logout();
            if (mobile) {
              router.replace(`/?reset=${encodeURIComponent(mobile)}` as any);
            } else {
              router.replace("/" as any);
            }
          },
        },
      ]
    );
  };

  const title =
    mode === "verify"
      ? "Enter passcode"
      : mode === "login"
      ? "Welcome back"
      : mode === "reset"
      ? firstCode
        ? "Confirm new passcode"
        : "Create new passcode"
      : mode === "create"
      ? "Create passcode"
      : "Confirm passcode";

  const subtitle =
    mode === "verify"
      ? "Enter your 4-digit passcode to continue"
      : mode === "login"
      ? `Enter your 4-digit passcode for +91 ${mobile}`
      : mode === "reset"
      ? firstCode
        ? "Re-enter the new passcode"
        : "Set a new 4-digit passcode for your account"
      : mode === "create"
      ? "Set a 4-digit passcode for faster, secure access"
      : "Re-enter your passcode to confirm";

  const showBack = mode === "login" || mode === "reset";
  const showForgot = mode === "verify" || mode === "login";

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.top}>
        {showBack ? (
          <TouchableOpacity
            testID="back-btn"
            onPress={() => router.replace("/")}
            style={styles.logoutBtn}
          >
            <Ionicons name="chevron-back" size={22} color={Colors.textPrimary} />
          </TouchableOpacity>
        ) : (
          <View />
        )}
        {mode === "verify" && (
          <TouchableOpacity
            testID="logout-btn"
            onPress={async () => {
              await logout();
              router.replace("/");
            }}
            style={styles.logoutBtn}
          >
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
                style={[styles.box, filled && styles.boxFilled, err && styles.boxErr]}
              >
                {filled && (
                  <View style={[styles.dot, err && { backgroundColor: Colors.danger }]} />
                )}
              </View>
            );
          })}
        </Animated.View>

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

        {showForgot && (
          <TouchableOpacity testID="forgot-btn" onPress={onForgot} style={{ marginTop: 18 }}>
            <Text style={styles.forgotLink}>Forgot Passcode?</Text>
          </TouchableOpacity>
        )}

        {status.kind === "err" && <Text style={styles.errMsg}>{status.msg}</Text>}
        {status.kind === "ok" && <Text style={styles.okMsg}>{status.msg}</Text>}
      </View>

      <View style={styles.footer}>
        <PrimaryButton
          testID="verify-btn"
          title={
            mode === "verify"
              ? "Verify"
              : mode === "login"
              ? "Sign in"
              : mode === "reset"
              ? firstCode
                ? "Update passcode"
                : "Next"
              : mode === "create"
              ? "Next"
              : "Confirm"
          }
          disabled={code.length !== 4 || busy}
          loading={busy}
          onPress={submit}
        />
      </View>
    </SafeAreaView>
  );
}

function useScreenStyles() {
  return useThemedStyles(() =>
    StyleSheet.create({
      safe: { flex: 1, backgroundColor: Colors.bg },
      top: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingHorizontal: Spacing.md,
        paddingTop: Spacing.sm,
      },
      logoutBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: Colors.surface,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: Colors.borderLight,
        ...Shadows.card,
      },
      content: { flex: 1, paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg },
      title: {
        fontSize: 30,
        fontWeight: "800",
        color: Colors.textPrimary,
        letterSpacing: -0.6,
      },
      subtitle: { marginTop: 8, color: Colors.textSecondary, fontSize: 13, lineHeight: 20 },
      boxesRow: { flexDirection: "row", gap: 14, marginTop: Spacing.xl },
      box: {
        width: 56,
        height: 60,
        borderRadius: 10,
        backgroundColor: Colors.surface,
        borderWidth: 1,
        borderColor: Colors.borderLight,
        alignItems: "center",
        justifyContent: "center",
      },
      boxFilled: { borderColor: Colors.primary },
      boxErr: { borderColor: Colors.danger, backgroundColor: Colors.danger + "10" },
      dot: { width: 14, height: 14, borderRadius: 7, backgroundColor: Colors.primary },
      hiddenInput: { position: "absolute", width: 1, height: 1, opacity: 0 },
      forgotLink: { color: Colors.primary, fontWeight: "800", fontSize: 14 },
      errMsg: { marginTop: 14, color: Colors.danger, fontSize: 13, fontWeight: "700" },
      okMsg: { marginTop: 14, color: Colors.success, fontSize: 13, fontWeight: "800" },
      footer: { padding: Spacing.lg, paddingBottom: Spacing.xl },
    })
  );
}
