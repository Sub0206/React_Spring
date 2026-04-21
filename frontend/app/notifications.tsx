import React, { useCallback, useRef, useState } from "react";
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl,
  Animated, Alert, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Swipeable } from "react-native-gesture-handler";
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

function relTime(iso: string) {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const diff = (Date.now() - t) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(t).toLocaleDateString();
}

export default function Notifications() {
  const router = useRouter();
  const [items, setItems] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(false);
  const swipeableRefs = useRef<Record<string, Swipeable | null>>({});
  const closeAllSwipes = () => {
    Object.values(swipeableRefs.current).forEach((r) => r?.close());
  };

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
    // Optimistic
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    try { await api("/notifications/read-all", { method: "POST" }); }
    catch { load(); }
  };

  const markRead = async (id: string) => {
    setItems((prev) => prev.map((n) => (n.notification_id === id ? { ...n, read: true } : n)));
    try { await api(`/notifications/${id}/read`, { method: "POST" }); }
    catch { /* noop */ }
  };

  const deleteOne = async (id: string) => {
    // Optimistic: remove instantly for a snappy feel
    setItems((prev) => prev.filter((n) => n.notification_id !== id));
    swipeableRefs.current[id]?.close();
    delete swipeableRefs.current[id];
    try { await api(`/notifications/${id}`, { method: "DELETE" }); }
    catch { load(); }
  };

  const clearAll = () => {
    const doClear = async () => {
      setItems([]);
      try { await api("/notifications", { method: "DELETE" }); }
      catch { load(); }
    };
    if (Platform.OS === "web") {
      // window.confirm is sync on web
      if (typeof window !== "undefined" && !window.confirm("Clear all notifications? This cannot be undone.")) return;
      doClear();
    } else {
      Alert.alert(
        "Clear all notifications?",
        "This cannot be undone.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Clear all", style: "destructive", onPress: doClear },
        ],
      );
    }
  };

  const unread = items.filter((n) => !n.read).length;
  const hasAny = items.length > 0;
  // Show "Clear all" once everything is read (or empty-but-previously-had) —
  // that matches the spec: "After Mark All Read show Clear All".
  const showClearAll = hasAny && unread === 0;

  // ---------- Swipeable render actions ----------
  const renderRightActions = (item: Notif, progress: Animated.AnimatedInterpolation<number>) => {
    const trans = progress.interpolate({
      inputRange: [0, 1],
      outputRange: [80, 0],
      extrapolate: "clamp",
    });
    return (
      <Animated.View style={[styles.rightAction, { transform: [{ translateX: trans }] }]}>
        <TouchableOpacity
          testID={`notif-delete-${item.notification_id}`}
          onPress={() => deleteOne(item.notification_id)}
          style={styles.deleteBtn}
          activeOpacity={0.85}
        >
          <Ionicons name="trash" size={20} color="#fff" />
          <Text style={styles.actionTxt}>Delete</Text>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  const renderLeftActions = (item: Notif, progress: Animated.AnimatedInterpolation<number>) => {
    if (item.read) return null;
    const trans = progress.interpolate({
      inputRange: [0, 1],
      outputRange: [-80, 0],
      extrapolate: "clamp",
    });
    return (
      <Animated.View style={[styles.leftAction, { transform: [{ translateX: trans }] }]}>
        <TouchableOpacity
          testID={`notif-markread-${item.notification_id}`}
          onPress={() => { markRead(item.notification_id); swipeableRefs.current[item.notification_id]?.close(); }}
          style={styles.readBtn}
          activeOpacity={0.85}
        >
          <Ionicons name="checkmark-done" size={20} color="#fff" />
          <Text style={styles.actionTxt}>Read</Text>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      {/* Top nav bar — ALWAYS visible (back button persists in empty state) */}
      <View style={styles.topBar}>
        <TouchableOpacity
          testID="notif-back"
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/dashboard" as any))}
          style={styles.backBtn}
        >
          <Ionicons name="chevron-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.topTitle}>Notifications</Text>
        {unread > 0 ? (
          <TouchableOpacity testID="mark-all-read" onPress={markAllRead} style={styles.ghostBtn}>
            <Text style={styles.ghostBtnText}>Mark all read</Text>
          </TouchableOpacity>
        ) : showClearAll ? (
          <TouchableOpacity testID="clear-all" onPress={clearAll} style={styles.dangerBtn}>
            <Ionicons name="trash-outline" size={14} color={Colors.danger} />
            <Text style={styles.dangerBtnText}>Clear all</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 44 }} />
        )}
      </View>

      <View style={styles.subHeader}>
        <Text style={styles.subtitle}>
          {hasAny ? (unread > 0 ? `${unread} unread` : "All caught up") : "No alerts right now"}
        </Text>
      </View>

      <FlatList
        testID="notifications-list"
        data={items}
        keyExtractor={(i) => i.notification_id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={Colors.primary} />}
        contentContainerStyle={[
          { paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm, paddingBottom: Spacing.xxl },
          items.length === 0 && { flexGrow: 1, justifyContent: "center" },
        ]}
        ListEmptyComponent={
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Ionicons name="notifications-off-outline" size={44} color={Colors.primary} />
            </View>
            <Text style={styles.emptyTitle}>No notifications available</Text>
            <Text style={styles.emptyText}>You&apos;ll see updates here as applications & EMIs update.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <Swipeable
            ref={(ref) => { swipeableRefs.current[item.notification_id] = ref; }}
            renderRightActions={(progress) => renderRightActions(item, progress)}
            renderLeftActions={(progress) => renderLeftActions(item, progress)}
            onSwipeableWillOpen={() => {
              // Close other open swipeables
              Object.entries(swipeableRefs.current).forEach(([id, r]) => {
                if (id !== item.notification_id) r?.close();
              });
            }}
            overshootLeft={false}
            overshootRight={false}
            friction={1.6}
            rightThreshold={42}
            leftThreshold={42}
          >
            <TouchableOpacity
              testID={`notif-${item.notification_id}`}
              onPress={() => { closeAllSwipes(); if (!item.read) markRead(item.notification_id); }}
              activeOpacity={0.92}
              style={[styles.row, !item.read && styles.rowUnread]}
            >
              <View style={[styles.icon, { backgroundColor: (typeColor[item.type] || Colors.primary) + "1A" }]}>
                <Ionicons name={typeIcon[item.type] || "notifications"} size={18} color={typeColor[item.type] || Colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.rowHead}>
                  <Text style={styles.notifTitle} numberOfLines={1}>{item.title}</Text>
                  <Text style={styles.notifTime}>{relTime(item.created_at)}</Text>
                </View>
                <Text style={styles.notifBody} numberOfLines={2}>{item.body}</Text>
              </View>
              {!item.read && <View style={styles.dot} />}
            </TouchableOpacity>
          </Swipeable>
        )}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  topBar: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    backgroundColor: Colors.bg,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.surface, alignItems: "center", justifyContent: "center",
    ...Shadows.card,
  },
  topTitle: { flex: 1, fontSize: 18, fontWeight: "800", color: Colors.textPrimary, letterSpacing: -0.2 },
  subHeader: { paddingHorizontal: Spacing.lg, paddingBottom: 6 },
  subtitle: { color: Colors.textSecondary, fontSize: 12.5, fontWeight: "600" },

  ghostBtn: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: Radii.pill,
    backgroundColor: Colors.primary + "15", borderWidth: 1, borderColor: Colors.primary + "33",
  },
  ghostBtnText: { color: Colors.primary, fontWeight: "800", fontSize: 11.5, letterSpacing: 0.2 },
  dangerBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 10, paddingVertical: 7, borderRadius: Radii.pill,
    backgroundColor: Colors.danger + "12", borderWidth: 1, borderColor: Colors.danger + "33",
  },
  dangerBtnText: { color: Colors.danger, fontWeight: "800", fontSize: 11.5, letterSpacing: 0.2 },

  row: {
    flexDirection: "row", gap: Spacing.md, alignItems: "center",
    backgroundColor: Colors.surface, borderRadius: Radii.lg,
    padding: Spacing.md, ...Shadows.card,
  },
  rowUnread: { borderLeftWidth: 3, borderLeftColor: Colors.primary },
  rowHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  icon: { width: 40, height: 40, borderRadius: Radii.pill, alignItems: "center", justifyContent: "center" },
  notifTitle: { flex: 1, fontWeight: "800", color: Colors.textPrimary, fontSize: 14.5 },
  notifTime: { fontSize: 11, color: Colors.textMuted, fontWeight: "600" },
  notifBody: { color: Colors.textSecondary, marginTop: 3, fontSize: 13, lineHeight: 18 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.primary },

  // Swipe actions
  rightAction: {
    justifyContent: "center", alignItems: "flex-end",
    borderRadius: Radii.lg, marginBottom: 0,
  },
  leftAction: {
    justifyContent: "center", alignItems: "flex-start",
    borderRadius: Radii.lg, marginBottom: 0,
  },
  deleteBtn: {
    width: 88, height: "100%", backgroundColor: Colors.danger,
    alignItems: "center", justifyContent: "center",
    borderTopRightRadius: Radii.lg, borderBottomRightRadius: Radii.lg,
  },
  readBtn: {
    width: 88, height: "100%", backgroundColor: Colors.success,
    alignItems: "center", justifyContent: "center",
    borderTopLeftRadius: Radii.lg, borderBottomLeftRadius: Radii.lg,
  },
  actionTxt: { color: "#fff", fontWeight: "800", fontSize: 11, marginTop: 3, letterSpacing: 0.3 },

  empty: { alignItems: "center", padding: Spacing.lg },
  emptyIcon: {
    width: 84, height: 84, borderRadius: 42,
    backgroundColor: Colors.primary + "12",
    alignItems: "center", justifyContent: "center", marginBottom: Spacing.md,
  },
  emptyTitle: { fontSize: 18, fontWeight: "800", color: Colors.textPrimary, marginTop: 4 },
  emptyText: { color: Colors.textSecondary, marginTop: 6, textAlign: "center", fontSize: 13, lineHeight: 19, maxWidth: 300 },
});
