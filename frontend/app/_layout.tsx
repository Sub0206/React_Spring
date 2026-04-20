import React, { useEffect } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import * as Linking from "expo-linking";
import { AuthProvider, useAuth } from "../src/auth";
import { DialogProvider } from "../src/dialog";
import { I18nProvider } from "../src/i18n";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Colors } from "../src/theme";
import { View, ActivityIndicator } from "react-native";

function AuthGate() {
  const { user, loading, googleExchange } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  // Handle Emergent Google auth return with #session_id= in URL hash (web preview)
  useEffect(() => {
    (async () => {
      try {
        const urlStr = await Linking.getInitialURL();
        const toCheck = [urlStr, typeof window !== "undefined" ? window.location?.href : null].filter(Boolean) as string[];
        for (const u of toCheck) {
          const hashIdx = u.indexOf("#");
          if (hashIdx === -1) continue;
          const frag = u.substring(hashIdx + 1);
          const params = new URLSearchParams(frag);
          const sid = params.get("session_id");
          if (sid) {
            await googleExchange(sid);
            if (typeof window !== "undefined" && window.history) {
              window.history.replaceState(null, "", window.location.pathname);
            }
            router.replace("/(tabs)/dashboard");
            return;
          }
        }
      } catch (e) {
        console.log("google exchange err", e);
      }
    })();
  }, []);

  useEffect(() => {
    if (loading) return;
    const inAuth = segments[0] === undefined || segments[0] === "index";
    if (!user && !inAuth) {
      router.replace("/");
    } else if (user && inAuth) {
      router.replace("/(tabs)/dashboard");
    }
  }, [user, loading, segments]);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: Colors.bg }}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.bg } }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="application/[id]" options={{ presentation: "card" }} />
      <Stack.Screen name="loan/[id]" options={{ presentation: "card" }} />
      <Stack.Screen name="client/add" options={{ presentation: "modal" }} />
      <Stack.Screen name="client/[id]" options={{ presentation: "card" }} />
      <Stack.Screen name="loan-new/[clientId]" options={{ presentation: "card" }} />
      <Stack.Screen name="loan-approve/[clientId]" options={{ presentation: "card" }} />
      <Stack.Screen name="subscribe" options={{ presentation: "card" }} />
      <Stack.Screen name="settings/language" options={{ presentation: "modal" }} />
      <Stack.Screen name="subscription" options={{ presentation: "card" }} />
      <Stack.Screen name="overdue" options={{ presentation: "card" }} />
      <Stack.Screen name="notifications" options={{ presentation: "card" }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <I18nProvider>
        <AuthProvider>
          <DialogProvider>
            <StatusBar style="dark" />
            <AuthGate />
          </DialogProvider>
        </AuthProvider>
      </I18nProvider>
    </SafeAreaProvider>
  );
}
