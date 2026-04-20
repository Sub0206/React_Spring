import React, { createContext, useCallback, useContext, useRef, useState } from "react";
import { View, Text, Modal, StyleSheet, Animated, Easing, TouchableOpacity, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Radii, Shadows, Spacing } from "./theme";

export type DialogTone = "success" | "danger" | "warning" | "info" | "primary";

export type DialogAction = {
  label: string;
  onPress?: () => void | Promise<void>;
  tone?: DialogTone;
  destructive?: boolean;
};

export type DialogOptions = {
  title: string;
  message?: string;
  tone?: DialogTone;
  icon?: keyof typeof Ionicons.glyphMap;
  actions?: DialogAction[];
  dismissible?: boolean;
};

const toneMap: Record<DialogTone, { color: string; bg: string; icon: keyof typeof Ionicons.glyphMap }> = {
  success: { color: Colors.success, bg: Colors.successSoft, icon: "checkmark-circle" },
  danger:  { color: Colors.danger,  bg: Colors.dangerSoft,  icon: "warning" },
  warning: { color: Colors.warning, bg: Colors.warningSoft, icon: "alert-circle" },
  info:    { color: Colors.info,    bg: Colors.infoSoft,    icon: "information-circle" },
  primary: { color: Colors.primary, bg: Colors.primarySoft, icon: "sparkles" },
};

type Ctx = {
  show: (opts: DialogOptions) => void;
  confirm: (opts: Omit<DialogOptions, "actions"> & { confirmLabel?: string; cancelLabel?: string; onConfirm?: () => void | Promise<void>; destructive?: boolean }) => void;
  success: (title: string, message?: string, onOk?: () => void) => void;
  error: (title: string, message?: string, onOk?: () => void) => void;
  warning: (title: string, message?: string, onOk?: () => void) => void;
  info: (title: string, message?: string, onOk?: () => void) => void;
};

const DialogContext = createContext<Ctx | null>(null);

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  const [opts, setOpts] = useState<DialogOptions | null>(null);
  const translate = useRef(new Animated.Value(40)).current;
  const backdrop = useRef(new Animated.Value(0)).current;

  const show = useCallback((o: DialogOptions) => {
    setOpts(o);
    setVisible(true);
    translate.setValue(40);
    backdrop.setValue(0);
    Animated.parallel([
      Animated.timing(backdrop, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.spring(translate, { toValue: 0, bounciness: 6, speed: 18, useNativeDriver: true }),
    ]).start();
  }, []);

  const hide = useCallback((cb?: () => void) => {
    Animated.parallel([
      Animated.timing(backdrop, { toValue: 0, duration: 160, useNativeDriver: true }),
      Animated.timing(translate, { toValue: 50, duration: 160, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
    ]).start(() => {
      setVisible(false);
      setOpts(null);
      cb?.();
    });
  }, []);

  const api: Ctx = {
    show,
    confirm: ({ title, message, tone = "warning", icon, confirmLabel = "Confirm", cancelLabel = "Cancel", onConfirm, destructive }) => {
      show({
        title, message, tone, icon,
        actions: [
          { label: cancelLabel },
          { label: confirmLabel, tone: destructive ? "danger" : "primary", destructive, onPress: onConfirm },
        ],
      });
    },
    success: (title, message, onOk) => show({ title, message, tone: "success", actions: [{ label: "Great", tone: "success", onPress: onOk }] }),
    error:   (title, message, onOk) => show({ title, message, tone: "danger",  actions: [{ label: "OK", tone: "danger",  onPress: onOk }] }),
    warning: (title, message, onOk) => show({ title, message, tone: "warning", actions: [{ label: "OK", tone: "warning", onPress: onOk }] }),
    info:    (title, message, onOk) => show({ title, message, tone: "info",    actions: [{ label: "OK", tone: "info",    onPress: onOk }] }),
  };

  const t = opts?.tone ?? "info";
  const tm = toneMap[t];
  const iconName: keyof typeof Ionicons.glyphMap = opts?.icon ?? tm.icon;

  return (
    <DialogContext.Provider value={api}>
      {children}
      <Modal visible={visible} transparent animationType="none" onRequestClose={() => (opts?.dismissible ?? true) && hide()}>
        <Animated.View style={[styles.backdrop, { opacity: backdrop }]} pointerEvents={visible ? "auto" : "none"}>
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => (opts?.dismissible ?? true) && hide()}
            style={StyleSheet.absoluteFillObject}
          />
          <Animated.View style={[styles.sheet, { transform: [{ translateY: translate }] }]}>
            <View style={[styles.headerStrip, { backgroundColor: tm.color }]} />
            <View style={styles.body}>
              <View style={[styles.iconWrap, { backgroundColor: tm.bg, borderColor: tm.color + "33" }]}>
                <Ionicons name={iconName} size={30} color={tm.color} />
              </View>
              <Text style={styles.title}>{opts?.title}</Text>
              {!!opts?.message && <Text style={styles.message}>{opts.message}</Text>}

              <View style={styles.actionRow}>
                {(opts?.actions ?? [{ label: "OK", tone: "primary" }]).map((a, idx) => {
                  const last = idx === (opts?.actions?.length ?? 1) - 1;
                  const aTone = a.tone ?? (last ? "primary" : "info");
                  const atm = toneMap[aTone];
                  const isCancel = !a.onPress && !last;
                  return (
                    <TouchableOpacity
                      key={idx}
                      testID={`dialog-action-${idx}`}
                      activeOpacity={0.85}
                      onPress={() => hide(() => { try { a.onPress?.(); } catch {} })}
                      style={[
                        styles.actionBtn,
                        isCancel ? styles.btnGhost : { backgroundColor: atm.color },
                      ]}
                    >
                      <Text style={[
                        styles.actionText,
                        isCancel ? { color: Colors.textPrimary } : { color: "#fff" },
                      ]}>
                        {a.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </Animated.View>
        </Animated.View>
      </Modal>
    </DialogContext.Provider>
  );
}

export function useDialog(): Ctx {
  const ctx = useContext(DialogContext);
  if (!ctx) {
    // Safe fallback if provider is missing (no-op)
    return {
      show: () => {}, confirm: () => {}, success: () => {}, error: () => {}, warning: () => {}, info: () => {},
    };
  }
  return ctx;
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: "rgba(15,23,42,0.55)",
    justifyContent: "center", alignItems: "center", paddingHorizontal: Spacing.lg,
  },
  sheet: {
    width: "100%", maxWidth: 420,
    backgroundColor: Colors.surface,
    borderRadius: 24, overflow: "hidden",
    ...(Platform.OS === "web"
      ? { boxShadow: "0px 24px 50px rgba(15,23,42,0.25)" }
      : { shadowColor: "#000", shadowOffset: { width: 0, height: 20 }, shadowOpacity: 0.2, shadowRadius: 30, elevation: 14 }),
  },
  headerStrip: { height: 6, width: "100%" },
  body: { padding: Spacing.xl, alignItems: "center" },
  iconWrap: {
    width: 64, height: 64, borderRadius: 32,
    alignItems: "center", justifyContent: "center",
    borderWidth: 2, marginBottom: Spacing.md,
  },
  title: { fontSize: 20, fontWeight: "800", color: Colors.textPrimary, textAlign: "center", letterSpacing: -0.3 },
  message: { fontSize: 14, color: Colors.textSecondary, textAlign: "center", marginTop: 8, lineHeight: 21 },
  actionRow: {
    flexDirection: "row", gap: 10, marginTop: Spacing.lg, alignSelf: "stretch",
  },
  actionBtn: {
    flex: 1, paddingVertical: 14, borderRadius: Radii.pill,
    alignItems: "center", justifyContent: "center", minHeight: 46,
    ...Shadows.card,
  },
  btnGhost: { backgroundColor: Colors.bgAlt },
  actionText: { fontSize: 14, fontWeight: "800", letterSpacing: 0.3 },
});
