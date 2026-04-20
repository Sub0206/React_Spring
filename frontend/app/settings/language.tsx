import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useI18n, LOCALES, t } from "../../src/i18n";
import { Colors, Radii, Shadows, Spacing } from "../../src/theme";

export default function LanguageScreen() {
  const router = useRouter();
  const { locale, setLocale } = useI18n();

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} testID="lang-back">
          <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>{t("language")}</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: Spacing.lg }}>
        <Text style={styles.hint}>Select your preferred language. Changes apply instantly across the app.</Text>
        {LOCALES.map((l) => {
          const active = l.code === locale;
          return (
            <TouchableOpacity
              key={l.code}
              testID={`lang-${l.code}`}
              style={[styles.row, active && styles.rowActive]}
              activeOpacity={0.85}
              onPress={async () => {
                await setLocale(l.code);
                router.back();
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.native}>{l.native}</Text>
                <Text style={styles.english}>{l.label}</Text>
              </View>
              {active ? (
                <View style={styles.check}>
                  <Ionicons name="checkmark" size={18} color="#fff" />
                </View>
              ) : (
                <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  topBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  backBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.surface, alignItems: "center", justifyContent: "center", ...Shadows.card },
  title: { flex: 1, textAlign: "center", fontSize: 18, fontWeight: "800", color: Colors.textPrimary },
  hint: { color: Colors.textSecondary, fontSize: 13, marginBottom: Spacing.md, lineHeight: 18 },
  row: {
    flexDirection: "row", alignItems: "center", gap: 12,
    padding: 16, backgroundColor: Colors.surface, borderRadius: Radii.lg,
    marginBottom: 10, borderWidth: 1, borderColor: Colors.borderLight,
  },
  rowActive: { borderColor: Colors.primary, borderWidth: 2 },
  native: { fontSize: 18, fontWeight: "800", color: Colors.textPrimary },
  english: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  check: { width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.primary, alignItems: "center", justifyContent: "center" },
});
