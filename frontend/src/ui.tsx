import React from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TouchableOpacity,
  View,
  ViewStyle,
} from "react-native";
import { Colors, Radii, Shadows, Spacing } from "./theme";

export function Card({ children, style, testID }: { children: React.ReactNode; style?: ViewStyle; testID?: string }) {
  return (
    <View testID={testID} style={[styles.card, style]}>
      {children}
    </View>
  );
}

export function PrimaryButton({
  title,
  onPress,
  loading,
  disabled,
  testID,
  icon,
  variant = "primary",
}: {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  testID?: string;
  icon?: React.ReactNode;
  variant?: "primary" | "secondary" | "success" | "danger" | "ghost";
}) {
  const bg =
    variant === "primary"
      ? Colors.primary
      : variant === "success"
      ? Colors.success
      : variant === "danger"
      ? Colors.danger
      : variant === "ghost"
      ? "transparent"
      : Colors.surface;
  const color =
    variant === "secondary" ? Colors.textPrimary : variant === "ghost" ? Colors.primary : "#fff";
  const border = variant === "secondary" ? Colors.border : "transparent";
  return (
    <TouchableOpacity
      testID={testID}
      disabled={disabled || loading}
      activeOpacity={0.85}
      onPress={onPress}
      style={[
        styles.btn,
        { backgroundColor: bg, borderWidth: variant === "secondary" ? 2 : 0, borderColor: border },
        variant === "primary" && Shadows.button,
        (disabled || loading) && { opacity: 0.6 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={color} />
      ) : (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          {icon}
          <Text style={[styles.btnText, { color }]}>{title}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

export function Input(props: TextInputProps & { testID?: string }) {
  return (
    <TextInput
      placeholderTextColor={Colors.textMuted}
      {...props}
      style={[styles.input, props.style]}
    />
  );
}

export function Badge({
  label,
  color = Colors.primary,
  bg,
  testID,
}: {
  label: string;
  color?: string;
  bg?: string;
  testID?: string;
}) {
  return (
    <View
      testID={testID}
      style={[
        styles.badge,
        { backgroundColor: bg ?? color + "22", borderColor: color + "33" },
      ]}
    >
      <Text style={{ color, fontWeight: "700", fontSize: 12 }}>{label}</Text>
    </View>
  );
}

export function Divider() {
  return <View style={{ height: 1, backgroundColor: Colors.borderLight, marginVertical: Spacing.md }} />;
}

// Avatar with initials — no profile image dependency
export function InitialsAvatar({
  name,
  size = 48,
  color = Colors.primary,
  testID,
}: {
  name?: string;
  size?: number;
  color?: string;
  testID?: string;
}) {
  const initials = (name || "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .filter(Boolean)
    .join("") || "?";

  return (
    <View
      testID={testID}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color + "1A",
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1.5,
        borderColor: color + "33",
      }}
    >
      <Text style={{ color, fontSize: Math.round(size * 0.38), fontWeight: "800" }}>
        {initials}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radii.xl,
    padding: Spacing.lg,
    ...Shadows.card,
  },
  btn: {
    height: 54,
    borderRadius: Radii.pill,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.lg,
  },
  btnText: { fontSize: 16, fontWeight: "700" },
  input: {
    height: 54,
    borderRadius: Radii.md,
    borderWidth: 2,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.surface,
    fontSize: 16,
    color: Colors.textPrimary,
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: Radii.pill,
    borderWidth: 1,
    alignSelf: "flex-start",
  },
});
