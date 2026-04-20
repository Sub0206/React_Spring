import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../src/api";
import { Colors, Radii, Shadows, Spacing } from "../src/theme";

type Notif = {
  notification_id: string;
  title: string;
  body: string;
  type: string;
  read: boolean;
  created_at: string;
};

const typeIcon: Record<string, any> = {
  application: "document-text",
  repayment: "cash",
  system: "information-circle",
  alert: "warning",
};
const typeColor: Record<string, string> = {
  application: Colors.primary,
  repayment: Colors.success,
  system: Colors.textSecondary,
  alert: Colors.danger,
};

export default function Notifications() {
  const [items, setItems] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await api<Notif[]>("/notifications"));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const markAllRead = async () => {
    await api("/notifications/read-all", { method: "POST" });
    load();
  };

  const markRead = async (id: string) => {
    await api(`/notifications/${id}/read`, { method: "POST" });
    setItems((prev) => prev.map((n) => (n.notification_id === id ? { ...n, read: true } : n)));
  };

  const unread = items.filter((n) => !n.read).length;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Notifications</Text>
          <Text style={styles.subtitle}>
            {unread > 0 ? `${unread} unread` : "All caught up"}
          </Text>
        </View>
        {unread > 0 && (
          <TouchableOpacity testID="mark-all-read" onPress={markAllRead} style={styles.markAll}>
            <Text style={styles.markAllText}>Mark all read</Text>
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        testID="notifications-list"
        data={items}
        keyExtractor={(i) => i.notification_id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        contentContainerStyle={{ padding: Spacing.lg, paddingBottom: Spacing.xxl }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="notifications-outline" size={60} color={Colors.textMuted} />
            <Text style={styles.emptyTitle}>No notifications</Text>
            <Text style={styles.emptyText}>You&apos;ll see updates here as you review loans.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            testID={`notif-${item.notification_id}`}
            onPress={() => markRead(item.notification_id)}
            activeOpacity={0.9}
            style={[styles.row, !item.read && styles.rowUnread]}
          >
            <View style={[styles.icon, { backgroundColor: typeColor[item.type] + "1A" }]}>
              <Ionicons name={typeIcon[item.type] || "notifications"} size={18} color={typeColor[item.type]} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.notifTitle}>{item.title}</Text>
              <Text style={styles.notifBody}>{item.body}</Text>
            </View>
            {!item.read && <View style={styles.dot} />}
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm, paddingBottom: Spacing.md,
  },
  title: { fontSize: 26, fontWeight: "800", color: Colors.textPrimary },
  subtitle: { color: Colors.textSecondary, marginTop: 2 },
  markAll: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: Radii.pill,
    backgroundColor: Colors.primary + "15",
  },
  markAllText: { color: Colors.primary, fontWeight: "700", fontSize: 13 },
  row: {
    flexDirection: "row", gap: Spacing.md, alignItems: "center",
    backgroundColor: Colors.surface, borderRadius: Radii.lg,
    padding: Spacing.md, marginBottom: 10, ...Shadows.card,
  },
  rowUnread: { borderWidth: 2, borderColor: Colors.primary + "33" },
  icon: { width: 40, height: 40, borderRadius: Radii.pill, alignItems: "center", justifyContent: "center" },
  notifTitle: { fontWeight: "700", color: Colors.textPrimary, fontSize: 15 },
  notifBody: { color: Colors.textSecondary, marginTop: 2, fontSize: 13 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.primary },
  empty: { alignItems: "center", marginTop: Spacing.xxl, padding: Spacing.lg },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: Colors.textPrimary, marginTop: Spacing.md },
  emptyText: { color: Colors.textSecondary, marginTop: 6, textAlign: "center" },
});
