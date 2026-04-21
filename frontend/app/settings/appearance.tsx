import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Radii, Shadows, Spacing } from "../../src/theme";
import { useTheme } from "../../src/themeContext";

type Option = { key: "system" | "light" | "dark"; label: string; desc: string; icon: any };

const OPTIONS: Option[] = [
  { key: "system", label: "Match system", desc: "Follow your device setting automatically",         icon: "phone-portrait" },
  { key: "light",  label: "Light",         desc: "Classic royal blue — great in sunlight",            icon: "sunny"           },
  { key: "dark",   label: "Dark",          desc: "Executive dark navy — premium & easy on the eyes", icon: "moon"            },
];

export default function AppearanceScreen() {
  const router = useRouter();
  const { mode, setMode, resolved } = useTheme();

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.topBar}>
        <TouchableOpacity
          testID="back-btn"
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/profile" as any))}
          style={styles.backBtn}
        >
          <Ionicons name="chevron-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.topTitle}>Appearance</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: Spacing.lg, paddingBottom: Spacing.xxl }}>
        <Text style={styles.section}>Theme</Text>
        <Text style={styles.sectionSub}>
          Switch anytime. Your choice is saved to this device and restored on next launch.
        </Text>

        <View style={styles.group}>
          {OPTIONS.map((opt) => {
            const selected = mode === opt.key;
            return (
              <TouchableOpacity
                key={opt.key}
                testID={`theme-${opt.key}`}
                onPress={() => setMode(opt.key)}
                activeOpacity={0.85}
                style={[styles.row, selected && styles.rowActive]}
              >
                <View style={[styles.iconWrap, selected && { backgroundColor: Colors.primary + "22" }]}>
                  <Ionicons name={opt.icon} size={20} color={selected ? Colors.primary : Colors.textSecondary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowTitle, selected && { color: Colors.primary }]}>{opt.label}</Text>
                  <Text style={styles.rowSub}>{opt.desc}</Text>
                </View>
                <View style={[styles.radio, selected && styles.radioActive]}>
                  {selected && <View style={styles.radioDot} />}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.previewHeader}>
          <Text style={styles.section}>Preview</Text>
          <Text style={styles.sectionSub}>Currently showing: <Text style={{ color: Colors.primary, fontWeight: "800" }}>{resolved.toUpperCase()}</Text></Text>
        </View>
        <View style={styles.previewCard}>
          <View style={styles.previewHero}>
            <Text style={styles.previewLabel}>TOTAL FUNDED</Text>
            <Text style={styles.previewHeroAmt}>₹13.1L</Text>
            <Text style={styles.previewSub}>Returns: ₹9.6k</Text>
          </View>
          <View style={styles.previewTilesRow}>
            <View style={[styles.previewTile, { backgroundColor: Colors.success + "1A" }]}>
              <Text style={[styles.previewTileNum, { color: Colors.success }]}>4</Text>
              <Text style={styles.previewTileLbl}>On Track</Text>
            </View>
            <View style={[styles.previewTile, { backgroundColor: Colors.danger + "1A" }]}>
              <Text style={[styles.previewTileNum, { color: Colors.danger }]}>4</Text>
              <Text style={styles.previewTileLbl}>Overdue</Text>
            </View>
            <View style={[styles.previewTile, { backgroundColor: Colors.warning + "1A" }]}>
              <Text style={[styles.previewTileNum, { color: Colors.warning }]}>6</Text>
              <Text style={styles.previewTileLbl}>At Risk</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
    flexDirection: "row", alignItems: "center", gap: 14,
    paddingHorizontal: Spacing.md, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: Colors.borderLight,
  },
  rowActive: { backgroundColor: Colors.primary + "0D" },
  iconWrap: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.bgAlt, alignItems: "center", justifyContent: "center",
  },
  rowTitle: { fontSize: 15, fontWeight: "800", color: Colors.textPrimary },
  rowSub: { fontSize: 12, color: Colors.textSecondary, marginTop: 2, lineHeight: 17 },
  radio: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 2, borderColor: Colors.border,
    alignItems: "center", justifyContent: "center",
  },
  radioActive: { borderColor: Colors.primary },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.primary },

  previewHeader: { marginTop: Spacing.xl },
  previewCard: {
    backgroundColor: Colors.surface, borderRadius: Radii.xl, padding: Spacing.md,
    borderWidth: 1, borderColor: Colors.borderLight, ...Shadows.card,
  },
  previewHero: {
    backgroundColor: Colors.primary, borderRadius: Radii.lg,
    padding: Spacing.md, marginBottom: Spacing.md,
  },
  previewLabel: { color: "rgba(255,255,255,0.78)", fontSize: 11, fontWeight: "800", letterSpacing: 0.6 },
  previewHeroAmt: { color: "#fff", fontSize: 26, fontWeight: "900", marginTop: 4 },
  previewSub: { color: "rgba(255,255,255,0.78)", fontSize: 12, marginTop: 2 },
  previewTilesRow: { flexDirection: "row", gap: 8 },
  previewTile: {
    flex: 1, borderRadius: Radii.md, padding: 12, alignItems: "center",
  },
  previewTileNum: { fontSize: 22, fontWeight: "900" },
  previewTileLbl: { fontSize: 11, fontWeight: "700", color: Colors.textSecondary, marginTop: 2 },
});
