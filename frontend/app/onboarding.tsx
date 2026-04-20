import React from "react";
import { View, Text, StyleSheet, SafeAreaView, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Onboarding from "react-native-onboarding-swiper";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Colors } from "../src/theme";

const ONBOARDED_KEY = "lendiq_onboarded";

function IconTile({ icon, bg, color }: { icon: any; bg: string; color: string }) {
  return (
    <View style={[styles.iconTile, { backgroundColor: bg }]}>
      <Ionicons name={icon} size={96} color={color} />
    </View>
  );
}

export default function OnboardingScreen() {
  const router = useRouter();

  const finish = async () => {
    try {
      await AsyncStorage.setItem(ONBOARDED_KEY, "1");
    } catch {}
    // On web, force a full reload so the root AuthGate re-reads AsyncStorage
    // and clears the onboarded flag that was cached on first load.
    if (Platform.OS === "web" && typeof window !== "undefined") {
      window.location.href = "/";
      return;
    }
    router.replace("/" as any);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
      <Onboarding
        onDone={finish}
        onSkip={finish}
        bottomBarHighlight={false}
        containerStyles={{ paddingHorizontal: 16 }}
        titleStyles={styles.title}
        subTitleStyles={styles.sub}
        pages={[
          {
            backgroundColor: "#EEF2FF",
            image: <IconTile icon="briefcase" bg="#1E40AF15" color="#1E40AF" />,
            title: "Easy Loan Management",
            subtitle: "Track every client and lending activity in one premium dashboard.",
          },
          {
            backgroundColor: "#ECFDF5",
            image: <IconTile icon="analytics" bg="#10B98115" color="#10B981" />,
            title: "AI Risk Analysis",
            subtitle: "Upload a bank statement — we parse, score, and flag bounce risk instantly.",
          },
          {
            backgroundColor: "#FEF3C7",
            image: <IconTile icon="stats-chart" bg="#D9770615" color="#D97706" />,
            title: "Portfolio Insights",
            subtitle: "See On-Track, Overdue, At-Risk and Completed loans at a glance.",
          },
          {
            backgroundColor: "#FCE7F3",
            image: <IconTile icon="cash" bg="#DC262615" color="#DC2626" />,
            title: "Fast Collections",
            subtitle: "Mark EMIs paid for the current month, rollback mistakes, and never miss a due date.",
          },
        ]}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  iconTile: {
    width: 200, height: 200, borderRadius: 40,
    alignItems: "center", justifyContent: "center", marginBottom: 24,
  },
  title: { fontSize: 26, fontWeight: "800", color: Colors.textPrimary, textAlign: "center" },
  sub: { fontSize: 15, color: Colors.textSecondary, textAlign: "center", marginTop: 8, paddingHorizontal: 12, lineHeight: 22 },
});
