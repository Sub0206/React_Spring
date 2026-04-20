import React, { useCallback, useState } from "react";
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../src/api";
import { InitialsAvatar } from "../../src/ui";
import { Colors, Radii, Shadows, Spacing } from "../../src/theme";

type Client = {
  client_id: string;
  name: string;
  mobile: string;
  aadhaar_masked: string;
  pan: string;
  aadhaar_verified: boolean;
  pan_verified: boolean;
  otp_verified: boolean;
  status?: string;
  reject_reason?: string | null;
  avatar?: string | null;
  created_at: string;
};

export default function Clients() {
  const router = useRouter();
  const [items, setItems] = useState<Client[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (searchTerm?: string) => {
    setLoading(true);
    try {
      const qs = searchTerm !== undefined ? searchTerm : q;
      const path = qs.trim() ? `/clients?q=${encodeURIComponent(qs.trim())}` : "/clients";
      setItems(await api<Client[]>(path));
    } catch (e) {
      console.log("clients load err", e);
    } finally {
      setLoading(false);
    }
  }, [q]);

  useFocusEffect(useCallback(() => { load(""); setQ(""); }, []));

  // Search with debounce
  React.useEffect(() => {
    const t = setTimeout(() => { load(q); }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Clients</Text>
          <Text style={styles.subtitle}>{items.length} verified {items.length === 1 ? "client" : "clients"}</Text>
        </View>
        <TouchableOpacity
          testID="add-client-btn"
          onPress={() => router.push("/client/add")}
          style={styles.addBtn}
          activeOpacity={0.9}
        >
          <Ionicons name="person-add" size={18} color="#fff" />
          <Text style={styles.addText}>Add</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.searchRow}>
        <Ionicons name="search" size={18} color={Colors.textMuted} />
        <TextInput
          testID="search-client"
          value={q}
          onChangeText={setQ}
          placeholder="Search by name, mobile or PAN"
          placeholderTextColor={Colors.textMuted}
          style={styles.searchInput}
          autoCapitalize="none"
        />
        {q.length > 0 && (
          <TouchableOpacity testID="clear-search" onPress={() => setQ("")}>
            <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        testID="clients-list"
        data={items}
        keyExtractor={(i) => i.client_id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => load(q)} />}
        contentContainerStyle={{ padding: Spacing.lg, paddingTop: Spacing.sm, paddingBottom: Spacing.xxl }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Ionicons name="people-outline" size={48} color={Colors.primary} />
            </View>
            <Text style={styles.emptyTitle}>{q ? "No matches" : "No clients yet"}</Text>
            <Text style={styles.emptyText}>
              {q ? "Try a different search term." : "Tap Add to onboard your first verified client."}
            </Text>
            {!q && (
              <TouchableOpacity
                testID="empty-add-client"
                onPress={() => router.push("/client/add")}
                style={styles.emptyBtn}
              >
                <Text style={styles.emptyBtnText}>Add your first client</Text>
              </TouchableOpacity>
            )}
          </View>
        }
        renderItem={({ item }) => {
          const rejected = item.status === "rejected";
          return (
            <TouchableOpacity
              testID={`client-item-${item.client_id}`}
              onPress={() => router.push({ pathname: "/client/[id]", params: { id: item.client_id } })}
              activeOpacity={0.9}
              style={[styles.card, rejected && styles.cardRejected]}
            >
              <InitialsAvatar name={item.name} size={52} color={rejected ? Colors.secondary : Colors.primary} />
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={styles.name}>{item.name}</Text>
                  {rejected && (
                    <View style={styles.rejectChip}>
                      <Ionicons name="close-circle" size={11} color="#fff" />
                      <Text style={styles.rejectChipText}>REJECTED</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.meta}>+91 {item.mobile}</Text>
                {rejected && item.reject_reason ? (
                  <Text
                    // @ts-ignore web-only hover title
                    accessibilityHint={item.reject_reason}
                    // @ts-ignore
                    title={item.reject_reason}
                    numberOfLines={1}
                    style={styles.rejectReason}
                  >
                    Reason: {item.reject_reason}
                  </Text>
                ) : (
                  <View style={styles.badges}>
                    {item.aadhaar_verified && <Verified label="Aadhaar" />}
                    {item.pan_verified && <Verified label="PAN" />}
                    {item.otp_verified && <Verified label="OTP" />}
                  </View>
                )}
              </View>
              <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
            </TouchableOpacity>
          );
        }}
      />
    </SafeAreaView>
  );
}

function Verified({ label }: { label: string }) {
  return (
    <View style={styles.vBadge}>
      <Ionicons name="checkmark-circle" size={11} color={Colors.success} />
      <Text style={styles.vText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: "row", alignItems: "center", gap: Spacing.md,
    paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm, paddingBottom: Spacing.md,
  },
  title: { fontSize: 26, fontWeight: "800", color: Colors.textPrimary },
  subtitle: { color: Colors.textSecondary, marginTop: 2 },
  addBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: Colors.primary, paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: Radii.pill, ...Shadows.button,
  },
  addText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  searchRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: Colors.surface, borderRadius: Radii.md,
    marginHorizontal: Spacing.lg, paddingHorizontal: Spacing.md,
    height: 48, borderWidth: 1, borderColor: Colors.border,
  },
  searchInput: { flex: 1, color: Colors.textPrimary, fontSize: 15 },
  card: {
    flexDirection: "row", alignItems: "center", gap: Spacing.md,
    backgroundColor: Colors.surface, borderRadius: Radii.xl,
    padding: Spacing.md, marginBottom: 10, ...Shadows.card,
  },
  cardRejected: {
    backgroundColor: "#FFF4E5",
    borderWidth: 1, borderColor: "#FFA94D",
  },
  rejectChip: {
    flexDirection: "row", alignItems: "center", gap: 3,
    backgroundColor: "#FF8C00", paddingHorizontal: 6, paddingVertical: 2, borderRadius: Radii.pill,
  },
  rejectChipText: { color: "#fff", fontSize: 9, fontWeight: "800", letterSpacing: 0.5 },
  rejectReason: { color: "#D97706", fontSize: 12, marginTop: 4, fontStyle: "italic" },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: Colors.bgAlt },
  name: { fontSize: 16, fontWeight: "700", color: Colors.textPrimary },
  meta: { color: Colors.textSecondary, fontSize: 13, marginTop: 2 },
  badges: { flexDirection: "row", gap: 6, marginTop: 8, flexWrap: "wrap" },
  vBadge: {
    flexDirection: "row", alignItems: "center", gap: 3,
    backgroundColor: Colors.success + "15",
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radii.pill,
  },
  vText: { color: Colors.success, fontSize: 11, fontWeight: "700" },
  empty: { alignItems: "center", marginTop: Spacing.xxl, padding: Spacing.lg },
  emptyIcon: {
    width: 100, height: 100, borderRadius: 50, backgroundColor: Colors.primary + "1A",
    alignItems: "center", justifyContent: "center", marginBottom: Spacing.md,
  },
  emptyTitle: { fontSize: 20, fontWeight: "800", color: Colors.textPrimary },
  emptyText: { color: Colors.textSecondary, marginTop: 6, textAlign: "center", paddingHorizontal: Spacing.lg },
  emptyBtn: {
    marginTop: Spacing.lg, backgroundColor: Colors.primary,
    paddingHorizontal: 24, paddingVertical: 12, borderRadius: Radii.pill,
    ...Shadows.button,
  },
  emptyBtnText: { color: "#fff", fontWeight: "800", fontSize: 14 },
});
