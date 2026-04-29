import React, { useEffect, useState } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import * as Linking from "expo-linking";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AuthProvider, useAuth } from "../src/auth";
import { DialogProvider } from "../src/dialog";
import { I18nProvider } from "../src/i18n";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StatusBar } from "expo-status-bar";
import { Colors } from "../src/theme";
import { ThemeProvider, useTheme } from "../src/themeContext";
import { hasPasscode, isSessionUnlocked } from "../src/passcode";
import { View, ActivityIndicator } from "react-native";

function AuthGate() {
  const { user, loading, googleExchange } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const [needsPasscode, setNeedsPasscode] = useState<boolean | null>(null);

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

  // Re-check passcode requirement whenever the user changes
  useEffect(() => {
    (async () => {
      if (!user) { setNeedsPasscode(false); return; }
      try {
        const has = await hasPasscode();
        setNeedsPasscode(has && !isSessionUnlocked());
      } catch {
        setNeedsPasscode(false);
      }
    })();
  }, [user]);

  useEffect(() => {
    if (loading || needsPasscode === null) return;
    const cur = segments[0] || "";
    const inAuth = cur === "" || cur === "index";
    const onOnboarding = cur === "onboarding";
    const onPasscode = cur === "passcode";

    if (!user && !inAuth && !onOnboarding) {
      router.replace("/");
    } else if (user && needsPasscode && !onPasscode) {
      router.replace({ pathname: "/passcode", params: { mode: "verify" } } as any);
    } else if (user && !needsPasscode && (inAuth || onOnboarding || onPasscode)) {
      router.replace("/(tabs)/dashboard");
    }
  }, [user, loading, segments, needsPasscode]);

  if (loading || needsPasscode === null) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: Colors.bg }}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.bg } }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="onboarding" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="application/[id]" options={{ presentation: "card" }} />
      <Stack.Screen name="loan/[id]" options={{ presentation: "card" }} />
      <Stack.Screen name="client/add" options={{ presentation: "modal" }} />
      <Stack.Screen name="client/[id]" options={{ presentation: "card" }} />
      <Stack.Screen name="loan-new/[clientId]" options={{ presentation: "card" }} />
      <Stack.Screen name="loan-approve/[clientId]" options={{ presentation: "card" }} />
      <Stack.Screen name="subscribe" options={{ presentation: "card" }} />
      <Stack.Screen name="settings/language" options={{ presentation: "modal" }} />
      <Stack.Screen name="settings/audit" options={{ presentation: "card" }} />
      <Stack.Screen name="settings/help" options={{ presentation: "card" }} />
      <Stack.Screen name="settings/appearance" options={{ presentation: "card" }} />
      <Stack.Screen name="settings/security" options={{ presentation: "card" }} />
      <Stack.Screen name="subscription" options={{ presentation: "card" }} />
      <Stack.Screen name="overdue" options={{ presentation: "card" }} />
      <Stack.Screen name="notifications" options={{ presentation: "card" }} />
      <Stack.Screen name="passcode" options={{ presentation: "card", gestureEnabled: false }} />
      <Stack.Screen name="assistant" options={{ presentation: "card" }} />
    </Stack>
  );
}

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.bg } }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="onboarding" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="application/[id]" options={{ presentation: "card" }} />
      <Stack.Screen name="loan/[id]" options={{ presentation: "card" }} />
      <Stack.Screen name="client/add" options={{ presentation: "modal" }} />
      <Stack.Screen name="client/[id]" options={{ presentation: "card" }} />
      <Stack.Screen name="loan-new/[clientId]" options={{ presentation: "card" }} />
      <Stack.Screen name="loan-approve/[clientId]" options={{ presentation: "card" }} />
      <Stack.Screen name="subscribe" options={{ presentation: "card" }} />
      <Stack.Screen name="settings/language" options={{ presentation: "modal" }} />
      <Stack.Screen name="settings/audit" options={{ presentation: "card" }} />
      <Stack.Screen name="settings/help" options={{ presentation: "card" }} />
      <Stack.Screen name="settings/appearance" options={{ presentation: "card" }} />
      <Stack.Screen name="settings/security" options={{ presentation: "card" }} />
      <Stack.Screen name="subscription" options={{ presentation: "card" }} />
      <Stack.Screen name="overdue" options={{ presentation: "card" }} />
      <Stack.Screen name="notifications" options={{ presentation: "card" }} />
      <Stack.Screen name="passcode" options={{ presentation: "card", gestureEnabled: false }} />
      <Stack.Screen name="assistant" options={{ presentation: "card" }} />
    </Stack>
  );
}

function ThemedApp() {
  const { ready, remountKey, resolved } = useTheme();
  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: Colors.bg }} />
    );
  }
  return (
    <View style={{ flex: 1, backgroundColor: Colors.bg }} key={remountKey}>
      <StatusBar style={resolved === "dark" ? "light" : "dark"} />
      <AuthGate />
    </View>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <I18nProvider>
            <AuthProvider>
              <DialogProvider>
                <ThemedApp />
              </DialogProvider>
            </AuthProvider>
          </I18nProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
