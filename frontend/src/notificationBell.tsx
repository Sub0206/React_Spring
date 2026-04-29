import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Animated, Easing, AppState } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { Colors } from "./theme";
import { useThemedStyles } from "./themeContext";
import { api, getToken } from "./api";

type Notif = { notification_id: string; read?: boolean };

/**
 * Header notification bell with live unread badge and a subtle pulse animation
 * triggered when the unread count transitions 0 → >0 or grows.
 *
 * Refresh sources:
 *   - On screen focus (useFocusEffect)
 *   - Light polling every 30s while the app is in foreground
 *   - Re-fetch immediately when app returns from background
 */
export function NotificationBell({
  onPress,
  testID = "btn-notifications",
}: {
  onPress?: () => void;
  testID?: string;
}) {
  const router = useRouter();
  const [count, setCount] = useState<number>(0);
  const prevCountRef = useRef<number>(0);
  const scale = useRef(new Animated.Value(1)).current;
  const dotPulse = useRef(new Animated.Value(0)).current;

  const styles = useThemedStyles(() =>
    StyleSheet.create({
      bell: {
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: Colors.surface,
        borderWidth: 1,
        borderColor: Colors.borderLight,
      },
      badge: {
        position: "absolute",
        top: -2,
        right: -2,
        minWidth: 18,
        height: 18,
        borderRadius: 9,
        paddingHorizontal: 4,
        backgroundColor: Colors.danger,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 2,
        borderColor: Colors.bg,
      },
      badgeText: { color: "#fff", fontSize: 10, fontWeight: "800", lineHeight: 12 },
      dotPulse: {
        position: "absolute",
        top: -2,
        right: -2,
        width: 18,
        height: 18,
        borderRadius: 9,
        backgroundColor: Colors.danger,
      },
    })
  );

  const fetchUnread = useCallback(async () => {
    try {
      // Don't even attempt if no token (e.g. on auth screen)
      const tok = await getToken();
      if (!tok) return;
      const list = await api<Notif[]>("/notifications");
      const unread = (list || []).filter((n) => !n.read).length;
      setCount((prev) => {
        prevCountRef.current = prev;
        return unread;
      });
    } catch {
      /* network errors are silently ignored — badge stays at last known value */
    }
  }, []);

  // Re-fetch on screen focus
  useFocusEffect(
    useCallback(() => {
      fetchUnread();
    }, [fetchUnread])
  );

  // Light polling every 30s while app is active. Pause when in background.
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer) return;
      timer = setInterval(fetchUnread, 30_000);
    };
    const stop = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };
    start();
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") {
        fetchUnread();
        start();
      } else {
        stop();
      }
    });
    return () => {
      stop();
      sub.remove();
    };
  }, [fetchUnread]);

  // Trigger a single subtle pulse when count transitions 0 → >0 or grows.
  useEffect(() => {
    const prev = prevCountRef.current;
    if (count > prev && count > 0) {
      // One-shot scale bounce
      scale.setValue(1);
      Animated.sequence([
        Animated.timing(scale, {
          toValue: 1.18,
          duration: 220,
          easing: Easing.out(Easing.back(2)),
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1,
          duration: 220,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start();
      // Dot ripple
      dotPulse.setValue(0);
      Animated.timing(dotPulse, {
        toValue: 1,
        duration: 700,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
    }
  }, [count, scale, dotPulse]);

  const display = count > 9 ? "9+" : String(count);
  const ringScale = dotPulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2.4] });
  const ringOpacity = dotPulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] });

  return (
    <TouchableOpacity
      testID={testID}
      activeOpacity={0.85}
      onPress={onPress || (() => router.push("/notifications"))}
      style={styles.bell}
    >
      <Animated.View style={{ transform: [{ scale }] }}>
        <Ionicons
          name={count > 0 ? "notifications" : "notifications-outline"}
          size={22}
          color={Colors.textPrimary}
        />
      </Animated.View>
      {count > 0 && (
        <>
          <Animated.View
            pointerEvents="none"
            style={[styles.dotPulse, { transform: [{ scale: ringScale }], opacity: ringOpacity }]}
          />
          <View style={styles.badge} testID="notification-badge">
            <Text style={styles.badgeText}>{display}</Text>
          </View>
        </>
      )}
    </TouchableOpacity>
  );
}
