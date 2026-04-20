import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Image, TouchableOpacity, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../src/auth";
import { api } from "../../src/api";
import { Card, PrimaryButton } from "../../src/ui";
import { Colors, Radii, Shadows, Spacing } from "../../src/theme";

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
  const [txns, setTxns] = useState<Txn[]>([]);
  const [refreshing, setRefreshing] = useState(false);

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
          <Text style={styles.sectionTitle}>Transaction history</Text>
          {txns.length === 0 ? (
            <Text style={styles.emptyText}>No transactions yet.</Text>
          ) : (
            txns.slice(0, 20).map((t) => (
              <View key={t.transaction_id} style={styles.txnRow}>
                <View style={[styles.txnIcon, { backgroundColor: (t.amount >= 0 ? Colors.success : Colors.danger) + "1A" }]}>
                  <Ionicons
                    name={t.amount >= 0 ? "arrow-down" : "arrow-up"}
                    size={16}
                    color={t.amount >= 0 ? Colors.success : Colors.danger}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.txnTitle}>{t.description}</Text>
                  <Text style={styles.txnDate}>{new Date(t.created_at).toLocaleDateString()}</Text>
                </View>
                <Text style={[styles.txnAmount, { color: t.amount >= 0 ? Colors.success : Colors.danger }]}>
                  {money(t.amount)}
                </Text>
              </View>
            ))
          )}
        </Card>

        <Card style={{ marginTop: Spacing.md }}>
          <Text style={styles.sectionTitle}>Settings</Text>
          {[
            { icon: "notifications", label: "Notification preferences" },
            { icon: "lock-closed", label: "Privacy & security" },
            { icon: "help-circle", label: "Help & support" },
          ].map((s) => (
            <TouchableOpacity key={s.label} style={styles.settingRow} activeOpacity={0.7}>
              <Ionicons name={s.icon as any} size={20} color={Colors.textSecondary} />
              <Text style={styles.settingText}>{s.label}</Text>
              <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
            </TouchableOpacity>
          ))}
        </Card>

        <View style={{ marginTop: Spacing.lg }}>
          <PrimaryButton
            testID="logout-btn"
            title="Log out"
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
  settingText: { flex: 1, fontSize: 15, color: Colors.textPrimary, fontWeight: "600" },
  emptyText: { color: Colors.textSecondary, textAlign: "center", paddingVertical: Spacing.md },
});
