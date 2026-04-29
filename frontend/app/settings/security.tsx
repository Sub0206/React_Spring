import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Radii, Shadows, Spacing } from "../../src/theme";
import { checkHasPasscode } from "../../src/passcode";
import { useAuth } from "../../src/auth";
import { useThemedStyles } from "../../src/themeContext";

/**
 * Security & passcode settings (server-driven, no biometric).
 *
 * The passcode is the only auth method. Status is read from the server
 * (`/auth/has-passcode`) for the currently signed-in user — never from device
 * storage.
 */
export default function SecurityScreen() {
  const styles = useScreenStyles();
  const router = useRouter();
  const { user } = useAuth();
  const [pcSet, setPcSet] = useState<boolean | null>(null);

  const load = useCallback(async () => {
    if (!user?.mobile) {
      setPcSet(false);
      return;
    }
    const has = await checkHasPasscode(user.mobile);
    // Treat unknown (null) as the prior value rather than flipping flags.
    if (has !== null) setPcSet(has);
  }, [user?.mobile]);

  useEffect(() => {
    load();
  }, [load]);

  const createOrChangePasscode = () => {
    // "create" mode triggers the create→confirm flow; on success the user
    // returns here.
    router.push({
      pathname: "/passcode",
      params: { mode: "create", redirect: "/settings/security" },
    });
  };

  const forgotPasscode = () => {
    if (!user?.mobile) return;
    Alert.alert(
      "Forgot / reset passcode",
      `We'll send a reset OTP to +91 ${user.mobile} so you can set a new passcode.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Continue",
          onPress: () => {
            router.replace(`/?reset=${encodeURIComponent(user.mobile)}` as any);
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={() =>
            router.canGoBack() ? router.back() : router.replace("/(tabs)/profile" as any)
          }
          style={styles.backBtn}
        >
          <Ionicons name="chevron-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.topTitle}>Security & Passcode</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: Spacing.lg, paddingBottom: Spacing.xxl }}>
        <Text style={styles.section}>App lock</Text>
        <Text style={styles.sectionSub}>
          A 4-digit passcode is the only way to sign in to LendIQ. We never store it on your device.
        </Text>

        <View style={styles.group}>
          <TouchableOpacity
            testID="row-passcode"
            style={styles.row}
            onPress={createOrChangePasscode}
            activeOpacity={0.8}
          >
            <View style={[styles.icon, { backgroundColor: Colors.primary + "1A" }]}>
              <Ionicons name="keypad" size={20} color={Colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>
                {pcSet ? "Change passcode" : "Create passcode"}
              </Text>
              <Text style={styles.rowSub}>
                {pcSet
                  ? "Replace your existing 4-digit passcode"
                  : "Set up a 4-digit passcode for quick & secure sign-in"}
              </Text>
            </View>
            <View
              style={[
                styles.pill,
                {
                  backgroundColor:
                    pcSet === null
                      ? Colors.border + "55"
                      : pcSet
                      ? Colors.success + "22"
                      : Colors.warning + "22",
                },
              ]}
            >
              <Text
                style={[
                  styles.pillTxt,
                  {
                    color:
                      pcSet === null
                        ? Colors.textMuted
                        : pcSet
                        ? Colors.success
                        : Colors.warning,
                  },
                ]}
              >
                {pcSet === null ? "…" : pcSet ? "ENABLED" : "NOT SET"}
              </Text>
            </View>
          </TouchableOpacity>

          {pcSet && (
            <TouchableOpacity
              testID="row-forgot-pc"
              style={[styles.row, { borderBottomWidth: 0 }]}
              onPress={forgotPasscode}
              activeOpacity={0.8}
            >
              <View style={[styles.icon, { backgroundColor: Colors.warning + "1A" }]}>
                <Ionicons name="refresh" size={20} color={Colors.warning} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>Forgot / reset passcode</Text>
                <Text style={styles.rowSub}>
                  Verify with OTP and set a new 4-digit passcode
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        <Text style={[styles.section, { marginTop: Spacing.xl }]}>How it works</Text>
        <View style={styles.infoCard}>
          <Ionicons name="shield-checkmark" size={18} color={Colors.primary} />
          <Text style={styles.infoTxt}>
            Your passcode is hashed (bcrypt) and stored on our servers — never in plaintext, and
            never on your device.{"\n\n"}
            Sessions stay active for 30 days. After that you&apos;ll re-enter your passcode to get
            back in. If you forget your passcode, use &quot;Forgot / reset passcode&quot; — we&apos;ll
            send a one-time OTP so you can set a new one.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function useScreenStyles() {
  return useThemedStyles(() =>
    StyleSheet.create({
      safe: { flex: 1, backgroundColor: Colors.bg },
      topBar: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.sm,
      },
      backBtn: {
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
      topTitle: { flex: 1, fontSize: 18, fontWeight: "800", color: Colors.textPrimary },
      section: {
        fontSize: 14,
        fontWeight: "800",
        color: Colors.textPrimary,
        letterSpacing: 0.3,
        marginBottom: 6,
      },
      sectionSub: {
        fontSize: 12.5,
        color: Colors.textSecondary,
        marginBottom: Spacing.md,
        lineHeight: 18,
      },
      group: {
        backgroundColor: Colors.surface,
        borderRadius: Radii.xl,
        borderWidth: 1,
        borderColor: Colors.borderLight,
        overflow: "hidden",
        ...Shadows.card,
      },
      row: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingHorizontal: Spacing.md,
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: Colors.borderLight,
      },
      icon: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: "center",
        justifyContent: "center",
      },
      rowTitle: { fontSize: 15, fontWeight: "800", color: Colors.textPrimary },
      rowSub: { fontSize: 12, color: Colors.textSecondary, marginTop: 2, lineHeight: 17 },
      pill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radii.pill },
      pillTxt: { fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
      infoCard: {
        flexDirection: "row",
        gap: 12,
        backgroundColor: Colors.surface,
        borderRadius: Radii.lg,
        borderWidth: 1,
        borderColor: Colors.borderLight,
        padding: Spacing.md,
      },
      infoTxt: { flex: 1, color: Colors.textSecondary, fontSize: 12.5, lineHeight: 19 },
    })
  );
}
