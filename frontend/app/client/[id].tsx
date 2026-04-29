import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../src/api";
import { Card, PrimaryButton, Badge, InitialsAvatar } from "../../src/ui";
import { Colors, Radii, Shadows, Spacing } from "../../src/theme";
import { useThemedStyles } from "../../src/themeContext";

type Client = {
  client_id: string; name: string; mobile: string;
  aadhaar_masked: string; pan: string;
  aadhaar_name?: string; pan_name?: string; pan_dob?: string;
  address_line1?: string; address_line2?: string;
  city?: string; state?: string; pincode?: string;
  status?: string; reject_reason?: string | null;
  aadhaar_verified: boolean; pan_verified: boolean; otp_verified: boolean;
  avatar?: string | null; created_at: string;
};

type ClientLoan = {
  application_id: string;
  amount: number;
  purpose: string;
  term_months: number;
  status: string;
  ai_score?: number | null;
  created_at: string;
};

export default function ClientDetail() {
  const styles = useScreenStyles();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [client, setClient] = useState<Client | null>(null);
  const [loans, setLoans] = useState<ClientLoan[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const redirected = React.useRef(false);

  const load = useCallback(async () => {
    try {
      const [c, ls] = await Promise.all([
        api<Client>(`/clients/${id}`),
        api<ClientLoan[]>(`/clients/${id}/loans`).catch(() => [] as ClientLoan[]),
      ]);
      setClient(c); setLoans(ls);
      // If no existing loans, redirect to new-loan flow (only first load)
      if (!redirected.current && ls.length === 0) {
        redirected.current = true;
        setTimeout(() => router.replace({ pathname: "/loan-new/[clientId]", params: { clientId: String(id) } }), 400);
      }
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally { setLoading(false); }
  }, [id, router]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = () => {
    Alert.alert("Remove client?", "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove", style: "destructive",
        onPress: async () => {
          try { await api(`/clients/${id}`, { method: "DELETE" }); router.replace("/(tabs)/clients"); }
          catch (e: any) { Alert.alert("Error", e.message); }
        },
      },
    ]);
  };

  if (loading || !client) {
    return (
      <SafeAreaView style={styles.safe}>
        <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 80 }} />
      </SafeAreaView>
    );
  }

  const statusColor = (s: string) =>
    s === "pending" ? Colors.secondary : s === "approved" ? Colors.info : s === "funded" ? Colors.success : Colors.danger;

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.topBar}>
        <TouchableOpacity testID="back-btn" onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.topTitle}>Client</Text>
        <TouchableOpacity testID="delete-client-btn" onPress={handleDelete} style={styles.backBtn}>
          <Ionicons name="trash-outline" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
        contentContainerStyle={{ paddingBottom: 120 }}
      >
        <View style={styles.heroBlock}>
          <View style={styles.heroAvatarWrap}>
            <InitialsAvatar name={client.name} size={96} color="#ffffff" />
          </View>
          <Text style={styles.name}>{client.name}</Text>
          <Text style={styles.mobile}>+91 {client.mobile}</Text>
          <View style={styles.vbadges}>
            {client.aadhaar_verified && <VBadge label="Aadhaar" />}
            {client.pan_verified && <VBadge label="PAN" />}
            {client.otp_verified && <VBadge label="Mobile" />}
          </View>
        </View>

        <View style={styles.content}>
          <Card>
            <Text style={styles.sectionTitle}>KYC documents</Text>
            <Row icon="card" label="Aadhaar" value={client.aadhaar_masked} sub={client.aadhaar_name} verified={client.aadhaar_verified} />
            <Row icon="document-text" label="PAN" value={client.pan} sub={client.pan_name && client.pan_dob ? `${client.pan_name} · DOB ${client.pan_dob}` : client.pan_name} verified={client.pan_verified} last />
          </Card>

          {(client.address_line1 || client.city) && (
            <Card style={{ marginTop: Spacing.md }}>
              <Text style={styles.sectionTitle}>Address</Text>
              <View style={{ flexDirection: "row", gap: 12, alignItems: "flex-start", paddingVertical: 10 }}>
                <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.primary + "15", alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name="location" size={18} color={Colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  {!!client.address_line1 && <Text style={{ color: Colors.textPrimary, fontSize: 14, fontWeight: "700" }}>{client.address_line1}</Text>}
                  {!!client.address_line2 && <Text style={{ color: Colors.textSecondary, fontSize: 13, marginTop: 2 }}>{client.address_line2}</Text>}
                  <Text style={{ color: Colors.textSecondary, fontSize: 13, marginTop: 2 }}>
                    {[client.city, client.state, client.pincode].filter(Boolean).join(" · ")}
                  </Text>
                </View>
              </View>
            </Card>
          )}

          {client.status === "rejected" && client.reject_reason && (
            <View style={{ marginTop: Spacing.md, padding: Spacing.md, borderRadius: Radii.lg, backgroundColor: "#FFF4E5", borderWidth: 1, borderColor: "#FFA94D" }}>
              <Text style={{ color: "#D97706", fontWeight: "800", fontSize: 12, letterSpacing: 0.5 }}>CLIENT REJECTED</Text>
              <Text style={{ color: Colors.textPrimary, marginTop: 6 }}>{client.reject_reason}</Text>
            </View>
          )}

          <View style={styles.loansHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.loansTitle}>Loan tracks</Text>
              <Text style={styles.loansSub}>{loans.length} {loans.length === 1 ? "loan" : "loans"} for this client</Text>
            </View>
            <TouchableOpacity
              testID="new-loan-btn"
              onPress={() => router.push({ pathname: "/loan-new/[clientId]", params: { clientId: client.client_id } })}
              activeOpacity={0.9}
              style={styles.newLoanBtn}
            >
              <Ionicons name="add-circle" size={18} color="#fff" />
              <Text style={styles.newLoanText}>New loan</Text>
            </TouchableOpacity>
          </View>

          {loans.length === 0 ? (
            <Card>
              <View style={{ alignItems: "center", paddingVertical: Spacing.lg }}>
                <Ionicons name="folder-open" size={40} color={Colors.textMuted} />
                <Text style={styles.emptyText}>No loans yet for {client.name.split(" ")[0]}.</Text>
                <Text style={[styles.emptyText, { fontSize: 12 }]}>Tap &quot;New loan&quot; to start.</Text>
              </View>
            </Card>
          ) : (
            loans.map((l) => (
              <TouchableOpacity
                key={l.application_id}
                testID={`loan-track-${l.application_id}`}
                onPress={() => router.push({ pathname: "/application/[id]", params: { id: l.application_id } })}
                activeOpacity={0.9}
                style={styles.loanCard}
              >
                <View style={[styles.loanIcon, { backgroundColor: statusColor(l.status) + "1A" }]}>
                  <Ionicons name="cash" size={20} color={statusColor(l.status)} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Text style={styles.loanAmount}>₹{l.amount.toLocaleString()}</Text>
                    <Badge label={l.status.toUpperCase()} color={statusColor(l.status)} />
                  </View>
                  <Text style={styles.loanMeta}>{l.purpose} · {l.term_months}mo</Text>
                </View>
                {l.ai_score != null && (
                  <View style={styles.scoreBadge}>
                    <Text style={styles.scoreBadgeText}>{l.ai_score}</Text>
                    <Text style={styles.scoreBadgeLabel}>AI</Text>
                  </View>
                )}
                <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
              </TouchableOpacity>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function VBadge({ label }: { label: string }) {
  const styles = useScreenStyles();
  return (
    <View style={styles.vb}>
      <Ionicons name="checkmark-circle" size={12} color="#fff" />
      <Text style={styles.vbText}>{label}</Text>
    </View>
  );
}

function Row({ icon, label, value, sub, verified, last }: { icon: any; label: string; value: string; sub?: string; verified: boolean; last?: boolean }) {
  return (
    <View style={[rowStyles.row, !last && rowStyles.divider]}>
      <View style={rowStyles.iconWrap}>
        <Ionicons name={icon} size={18} color={Colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={rowStyles.label}>{label}</Text>
        <Text style={rowStyles.value}>{value}</Text>
        {!!sub && <Text style={rowStyles.sub}>{sub}</Text>}
      </View>
      {verified && <Ionicons name="checkmark-circle" size={22} color={Colors.success} />}
    </View>
  );
}

const rowStyles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  divider: { borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  iconWrap: { width: 36, height: 36, borderRadius: Radii.pill, backgroundColor: Colors.primary + "15", alignItems: "center", justifyContent: "center" },
  label: { color: Colors.textMuted, fontSize: 11, fontWeight: "700", letterSpacing: 0.5 },
  value: { color: Colors.textPrimary, fontSize: 15, fontWeight: "700", marginTop: 2 },
  sub: { color: Colors.textSecondary, fontSize: 12, marginTop: 1 },
});

function useScreenStyles() {
  return useThemedStyles(() => StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  topBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, backgroundColor: Colors.primary },
  backBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  topTitle: { flex: 1, textAlign: "center", fontSize: 18, fontWeight: "800", color: "#fff" },
  heroBlock: { alignItems: "center", padding: Spacing.lg, backgroundColor: Colors.primary, paddingBottom: Spacing.xl },
  heroAvatarWrap: { padding: 4, borderRadius: 60, backgroundColor: "#ffffff20" },
  name: { fontSize: 24, fontWeight: "800", color: "#fff", marginTop: Spacing.md },
  mobile: { color: "#D9E7FF", marginTop: 4, fontSize: 14 },
  vbadges: { flexDirection: "row", gap: 6, marginTop: Spacing.sm, flexWrap: "wrap", justifyContent: "center" },
  vb: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#ffffff25", paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radii.pill },
  vbText: { color: "#fff", fontSize: 11, fontWeight: "800" },
  content: { padding: Spacing.lg, marginTop: -Spacing.md },
  sectionTitle: { fontSize: 16, fontWeight: "800", color: Colors.textPrimary, marginBottom: 4 },
  loansHeader: { flexDirection: "row", alignItems: "center", marginTop: Spacing.lg, marginBottom: Spacing.sm },
  loansTitle: { fontSize: 18, fontWeight: "800", color: Colors.textPrimary },
  loansSub: { color: Colors.textSecondary, fontSize: 12, marginTop: 2 },
  newLoanBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: Colors.primary, paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: Radii.pill, ...Shadows.button,
  },
  newLoanText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  emptyText: { color: Colors.textSecondary, marginTop: 8, textAlign: "center" },
  loanCard: {
    flexDirection: "row", alignItems: "center", gap: Spacing.md,
    backgroundColor: Colors.surface, borderRadius: Radii.lg,
    padding: Spacing.md, marginBottom: 8, ...Shadows.card,
  },
  loanIcon: { width: 40, height: 40, borderRadius: Radii.pill, alignItems: "center", justifyContent: "center" },
  loanAmount: { fontSize: 16, fontWeight: "800", color: Colors.textPrimary },
  loanMeta: { color: Colors.textSecondary, fontSize: 12, marginTop: 2 },
  scoreBadge: { alignItems: "center", paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radii.md, backgroundColor: Colors.primary + "15" },
  scoreBadgeText: { fontSize: 14, fontWeight: "800", color: Colors.primary },
  scoreBadgeLabel: { fontSize: 9, color: Colors.primary, fontWeight: "700" },
  }));
}

