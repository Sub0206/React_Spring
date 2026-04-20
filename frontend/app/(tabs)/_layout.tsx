import React from "react";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "../../src/theme";
import { Platform, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function TabsLayout() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  // Responsive labels
  const showLabels = width >= 360;

  // Safe-area aware bottom padding so tab bar never merges with:
  //  - iPhone home indicator
  //  - Android 3-button nav / gesture bar / back button
  //  - Samsung / foldable system UI
  const BASE_PADDING_BOTTOM = Platform.OS === "ios" ? 8 : 12;
  const MIN_BOTTOM_SPACE = Platform.OS === "ios" ? 20 : 14; // guarantees breathing room if no inset
  const extraBottom = Math.max(insets.bottom, MIN_BOTTOM_SPACE);
  const paddingBottom = extraBottom + BASE_PADDING_BOTTOM;

  // Icon area height + label + paddings
  const CONTENT_HEIGHT = showLabels ? 52 : 44;
  const height = CONTENT_HEIGHT + paddingBottom;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarShowLabel: showLabels,
        tabBarHideOnKeyboard: true,
        tabBarStyle: {
          backgroundColor: Colors.surface,
          borderTopWidth: 1,
          borderTopColor: Colors.borderLight,
          height,
          paddingBottom,
          paddingTop: 8,
          // Elevation / shadow for a professional lift
          elevation: 12,
          boxShadow: "0px -2px 12px rgba(0,0,0,0.06)",
        },
        tabBarItemStyle: {
          paddingHorizontal: 2,
          paddingVertical: 0,
        },
        tabBarLabelStyle: {
          fontSize: width < 380 ? 10 : 11,
          fontWeight: "700",
          marginTop: 2,
          marginBottom: 0,
          includeFontPadding: false,
        },
        tabBarIconStyle: {
          marginTop: showLabels ? 0 : 4,
          marginBottom: 0,
        },
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: "Home",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "home" : "home-outline"} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="applications"
        options={{
          title: width < 360 ? "Reqs" : "Requests",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "document-text" : "document-text-outline"} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="loans"
        options={{
          title: "Loans",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "wallet" : "wallet-outline"} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="clients"
        options={{
          title: "Clients",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "people" : "people-outline"} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "person-circle" : "person-circle-outline"} size={24} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
