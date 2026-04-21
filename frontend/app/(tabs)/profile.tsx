import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Image, TouchableOpacity, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../src/auth";
import { api } from "../../src/api";
import { Card, PrimaryButton } from "../../src/ui";
import { Colors, Radii, Shadows, Spacing } from "../../src/theme";
import { useI18n, LOCALES } from "../../src/i18n";

type Txn = {
  transaction_id: string;
  type: string;
  amount: number;
  borrower_name?: string | null;
  description: string;
  created_at: string;
};

function money(n: number) {
  const sign = n < 0 ? "-" : "+";
  return `${sign}$${Math.abs(n).toLocaleString()}`;
}

export default function Profile() {
  const { user, logout } = useAuth();
  const { locale, t } = useI18n();
  const router = useRouter();
  const [txns, setTxns] = useState<Txn[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const langLabel = LOCALES.find((l) => l.code === locale)?.native || "English";
  const currentTier = (user?.subscription_tier || "starter").toString();
  const tierLabel = currentTier === "smart" ? "Smart Credit" : currentTier === "prime" ? "Prime Elite" : "Starter";

  const load = useCallback(async () => {
    try {
      setTxns(await api<Txn[]>("/transactions"));
    } catch (e) {
      console.log("txn err", e);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ padding: Spacing.lg, paddingBottom: Spacing.xxl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      >
        <View style={styles.header}>
          <View style={styles.avatarWrap}>
            {user?.picture ? (
              <Image source={{ uri: user.picture }} style={{ width: 80, height: 80, borderRadius: 40 }} />
            ) : (
              <Text style={styles.avatarText}>{user?.name?.[0]?.toUpperCase() || "L"}</Text>
            )}
          </View>
          <Text style={styles.name}>{user?.name}</Text>
          <Text style={styles.email}>{user?.email}</Text>
          <View style={styles.roleBadge}>
            <Ionicons name="shield-checkmark" size={14} color={Colors.primary} />
            <Text style={styles.roleText}>Verified Lender</Text>
          </View>
        </View>

        <Card style={{ marginTop: Spacing.md }}>
          <Text style={styles.sectionTitle}>{t("settings")}</Text>

          <TouchableOpacity
            testID="row-subscription"
            style={[styles.settingRow, styles.settingRowFeature]}
            activeOpacity={0.7}
            onPress={() => router.push("/subscription")}
          >
            <View style={[styles.settingIconWrap, { backgroundColor: Colors.primary + "15" }]}>
              <Ionicons name="diamond" size={18} color={Colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.settingText}>{t("subscription")}</Text>
              <Text style={styles.settingSub}>{t("current_plan")}: {tierLabel}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity
            testID="row-language"
            style={[styles.settingRow, styles.settingRowFeature]}
            activeOpacity={0.7}
            onPress={() => router.push("/settings/language")}
          >
            <View style={[styles.settingIconWrap, { backgroundColor: Colors.success + "15" }]}>
              <Ionicons name="language" size={18} color={Colors.success} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.settingText}>{t("language")}</Text>
              <Text style={styles.settingSub}>{langLabel}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
          </TouchableOpacity>

          {[
            { icon: "color-palette", label: "Appearance",     route: "/settings/appearance", color: Colors.accent,  sub: "Light, Dark or Match system" },
            { icon: "shield-checkmark", label: "Security & Passcode", route: "/settings/security", color: Colors.primary, sub: "Passcode & biometric unlock" },
            { icon: "sparkles", label: "AI Assistant", route: "/assistant", color: Colors.info, sub: "Ask about your live portfolio" },
            { icon: "bar-chart", label: "Audit & Reports", route: "/settings/audit", color: Colors.warning, sub: "Inflow / outflow by month & year" },
            { icon: "chatbubbles", label: "Help & Support", route: "/settings/help", color: Colors.primary, sub: "Chat with our AI guide" },
          ].map((s) => (
            <TouchableOpacity
              key={s.label}
              testID={`row-${s.label.split(' ')[0].toLowerCase()}`}
              style={[styles.settingRow, styles.settingRowFeature]}
              activeOpacity={0.7}
              onPress={() => router.push(s.route as any)}
            >
              <View style={[styles.settingIconWrap, { backgroundColor: s.color + "15" }]}>
                <Ionicons name={s.icon as any} size={18} color={s.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.settingText}>{s.label}</Text>
                <Text style={styles.settingSub}>
                  {s.label === "Audit & Reports" ? "Inflow / outflow by month & year" : "Chat with our AI guide"}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
            </TouchableOpacity>
          ))}
        </Card>

        <View style={{ marginTop: Spacing.lg }}>
          <PrimaryButton
            testID="logout-btn"
            title={t("logout")}
            variant="secondary"
            onPress={logout}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: { alignItems: "center", padding: Spacing.md },
  avatarWrap: {
    width: 80, height: 80, borderRadius: 40, backgroundColor: Colors.primary,
    alignItems: "center", justifyContent: "center", ...Shadows.button,
  },
  avatarText: { color: "#fff", fontSize: 30, fontWeight: "800" },
  name: { fontSize: 22, fontWeight: "800", color: Colors.textPrimary, marginTop: Spacing.md },
  email: { color: Colors.textSecondary, marginTop: 2 },
  roleBadge: {
    flexDirection: "row", alignItems: "center", gap: 6,
    marginTop: Spacing.sm, paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: Radii.pill, backgroundColor: Colors.primary + "15",
  },
  roleText: { color: Colors.primary, fontWeight: "700", fontSize: 12 },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: Colors.textPrimary, marginBottom: Spacing.md },
  txnRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  txnIcon: { width: 36, height: 36, borderRadius: Radii.pill, alignItems: "center", justifyContent: "center" },
  txnTitle: { fontSize: 14, fontWeight: "600", color: Colors.textPrimary },
  txnDate: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  txnAmount: { fontSize: 15, fontWeight: "800" },
  settingRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.borderLight,
  },
  settingRowFeature: { paddingVertical: 14 },
  settingIconWrap: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  settingText: { flex: 1, fontSize: 15, color: Colors.textPrimary, fontWeight: "600" },
  settingSub: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  emptyText: { color: Colors.textSecondary, textAlign: "center", paddingVertical: Spacing.md },
});
