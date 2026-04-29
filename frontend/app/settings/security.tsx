import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch, Alert, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Radii, Shadows, Spacing } from "../../src/theme";
import {
  hasPasscode, clearPasscode, isBiometricAvailable,
  biometricEnabled, setBiometricEnabled, promptBiometric,
} from "../../src/passcode";
import { useThemedStyles } from "../../src/themeContext";

export default function SecurityScreen() {
  const styles = useScreenStyles();
  const router = useRouter();
  const [pcSet, setPcSet] = useState(false);
  const [bioOk, setBioOk] = useState(false);
  const [bioEn, setBioEn] = useState(false);
  const [bioName, setBioName] = useState("Biometric");

  const load = useCallback(async () => {
    setPcSet(await hasPasscode());
    const a = await isBiometricAvailable();
    setBioOk(a.hasHardware && a.isEnrolled);
    setBioName(a.types[0] || "Biometric");
    setBioEn(await biometricEnabled());
  }, []);

  useEffect(() => { load(); }, [load]);

  const createOrChangePasscode = () => {
    router.push({ pathname: "/passcode", params: { mode: "create", redirect: "/settings/security" } });
  };

  const removePasscode = () => {
    Alert.alert(
      "Remove passcode?",
      "You'll no longer need to enter a passcode to open LendIQ. Biometric unlock will also be disabled.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Remove", style: "destructive", onPress: async () => { await clearPasscode(); await load(); } },
      ],
    );
  };

  const toggleBio = async (v: boolean) => {
    if (v) {
      if (!pcSet) {
        Alert.alert("Set a passcode first", "Biometric requires a 4-digit passcode as fallback.");
        return;
      }
      if (Platform.OS === "web") {
        Alert.alert("Not available on web", "Please use the mobile app to enable biometric unlock.");
        return;
      }
      const ok = await promptBiometric(`Confirm ${bioName} to enable`);
      if (!ok) return;
      await setBiometricEnabled(true);
      setBioEn(true);
    } else {
      await setBiometricEnabled(false);
      setBioEn(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/profile" as any))} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.topTitle}>Security & Passcode</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: Spacing.lg, paddingBottom: Spacing.xxl }}>
        <Text style={styles.section}>App lock</Text>
        <Text style={styles.sectionSub}>Secure LendIQ with a 4-digit passcode and your device biometric.</Text>

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
              <Text style={styles.rowTitle}>{pcSet ? "Change passcode" : "Create passcode"}</Text>
              <Text style={styles.rowSub}>{pcSet ? "Replace your 4-digit passcode" : "4-digit quick login"}</Text>
            </View>
            <View style={[styles.pill, { backgroundColor: pcSet ? Colors.success + "22" : Colors.warning + "22" }]}>
              <Text style={[styles.pillTxt, { color: pcSet ? Colors.success : Colors.warning }]}>{pcSet ? "ENABLED" : "NOT SET"}</Text>
            </View>
          </TouchableOpacity>

          <View style={styles.row}>
            <View style={[styles.icon, { backgroundColor: Colors.accent + "1A" }]}>
              <Ionicons name="finger-print" size={20} color={Colors.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{bioName} unlock</Text>
              <Text style={styles.rowSub}>
                {!bioOk ? "Not available on this device" : bioEn ? "Enabled — faster sign-in" : "Use your fingerprint or face to unlock"}
              </Text>
            </View>
            <Switch
              testID="bio-switch"
              value={bioEn}
              disabled={!bioOk}
              onValueChange={toggleBio}
              trackColor={{ false: Colors.border, true: Colors.primary + "99" }}
              thumbColor={bioEn ? Colors.primary : "#fff"}
            />
          </View>

          {pcSet && (
            <TouchableOpacity testID="row-remove-pc" style={[styles.row, { borderBottomWidth: 0 }]} onPress={removePasscode} activeOpacity={0.8}>
              <View style={[styles.icon, { backgroundColor: Colors.danger + "1A" }]}>
                <Ionicons name="trash-outline" size={20} color={Colors.danger} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowTitle, { color: Colors.danger }]}>Remove passcode</Text>
                <Text style={styles.rowSub}>Disables both passcode & biometric</Text>
              </View>
            </TouchableOpacity>
          )}
        </View>

        <Text style={[styles.section, { marginTop: Spacing.xl }]}>How it works</Text>
        <View style={styles.infoCard}>
          <Ionicons name="shield-checkmark" size={18} color={Colors.primary} />
          <Text style={styles.infoTxt}>
            Your passcode is never sent to our servers. It&apos;s hashed locally with SHA-256 and stored in your device&apos;s secure keystore.
            {"\n\n"}
            5 wrong attempts triggers a 30-second lockout that doubles on repeat. If you forget your passcode, sign out and re-verify with OTP to set a new one.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function useScreenStyles() {
  return useThemedStyles(() => StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  topBar: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.surface, alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: Colors.borderLight, ...Shadows.card,
  },
  topTitle: { flex: 1, fontSize: 18, fontWeight: "800", color: Colors.textPrimary },

  section: { fontSize: 14, fontWeight: "800", color: Colors.textPrimary, letterSpacing: 0.3, marginBottom: 6 },
  sectionSub: { fontSize: 12.5, color: Colors.textSecondary, marginBottom: Spacing.md, lineHeight: 18 },

  group: {
    backgroundColor: Colors.surface, borderRadius: Radii.xl,
    borderWidth: 1, borderColor: Colors.borderLight,
    overflow: "hidden", ...Shadows.card,
  },
  row: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: Spacing.md, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: Colors.borderLight,
  },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  rowTitle: { fontSize: 15, fontWeight: "800", color: Colors.textPrimary },
  rowSub: { fontSize: 12, color: Colors.textSecondary, marginTop: 2, lineHeight: 17 },
  pill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radii.pill },
  pillTxt: { fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },

  infoCard: {
    flexDirection: "row", gap: 12,
    backgroundColor: Colors.surface, borderRadius: Radii.lg,
    borderWidth: 1, borderColor: Colors.borderLight,
    padding: Spacing.md,
  },
  infoTxt: { flex: 1, color: Colors.textSecondary, fontSize: 12.5, lineHeight: 19 },
  }));
}

