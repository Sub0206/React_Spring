import React, { useCallback, useRef, useState, useEffect } from "react";
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView,
  KeyboardAvoidingView, Platform, Keyboard, Animated,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../src/api";
import { Colors, Radii, Shadows, Spacing } from "../src/theme";

type Msg = { role: "user" | "bot"; text: string; ts: number };

const SUGGESTIONS: string[] = [
  "What is my inflow today?",
  "Which loans are overdue today?",
  "Loans funded this month?",
  "Show top 5 risky borrowers",
  "Pending approvals count?",
  "Total active loans?",
];

// Render markdown-ish bold (`**...**`) as bold Text spans.
function renderMd(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return parts.map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**")) {
      return <Text key={i} style={{ fontWeight: "800", color: Colors.textPrimary }}>{p.slice(2, -2)}</Text>;
    }
    return <Text key={i}>{p}</Text>;
  });
}

function TypingDots() {
  const anim = useRef([0, 1, 2].map(() => new Animated.Value(0.3))).current;
  useEffect(() => {
    const loops = anim.map((a, i) =>
      Animated.loop(Animated.sequence([
        Animated.timing(a, { toValue: 1, duration: 400, delay: i * 120, useNativeDriver: true }),
        Animated.timing(a, { toValue: 0.3, duration: 400, useNativeDriver: true }),
      ]))
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [anim]);
  return (
    <View style={{ flexDirection: "row", gap: 4, paddingVertical: 8, paddingHorizontal: 4 }}>
      {anim.map((a, i) => (
        <Animated.View key={i} style={{
          width: 7, height: 7, borderRadius: 4,
          backgroundColor: Colors.primary, opacity: a,
        }} />
      ))}
    </View>
  );
}

export default function Assistant() {
  const router = useRouter();
  const [msgs, setMsgs] = useState<Msg[]>([
    { role: "bot", ts: Date.now(), text: "Hi! I'm **LendIQ Business Assistant** ✨ — I can read your live portfolio and answer financial questions. Try one of the quick prompts below or ask me anything." },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const send = useCallback(async (override?: string) => {
    const q = (override ?? input).trim();
    if (!q || loading) return;
    setMsgs((prev) => [...prev, { role: "user", text: q, ts: Date.now() }]);
    setInput("");
    Keyboard.dismiss();
    setLoading(true);
    try {
      const history = msgs.slice(-6).map((m) => ({ role: m.role, text: m.text }));
      const r = await api<{ answer: string; source?: string }>("/assistant/query", {
        method: "POST", body: { question: q, history },
      });
      setMsgs((prev) => [...prev, { role: "bot", text: r.answer, ts: Date.now() }]);
    } catch (e: any) {
      setMsgs((prev) => [...prev, { role: "bot", text: `Couldn't fetch answer. ${e?.message || "Please retry."}`, ts: Date.now() }]);
    } finally {
      setLoading(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [input, loading, msgs]);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/dashboard" as any))} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={22} color={Colors.textPrimary} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Ionicons name="sparkles" size={16} color={Colors.info} />
              <Text style={styles.title}>Business Assistant</Text>
            </View>
            <Text style={styles.subtitle}>Ask about your portfolio, clients, EMIs & cashflow</Text>
          </View>
        </View>

        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: Spacing.lg, paddingBottom: 12 }}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        >
          {msgs.map((m, idx) => (
            <View key={idx} style={[styles.bubble, m.role === "user" ? styles.bubbleUser : styles.bubbleBot]}>
              {m.role === "bot" && (
                <View style={styles.botTag}>
                  <Ionicons name="sparkles" size={10} color={Colors.info} />
                  <Text style={styles.botTagTxt}>AI</Text>
                </View>
              )}
              <Text style={m.role === "user" ? styles.userText : styles.botText}>
                {renderMd(m.text)}
              </Text>
            </View>
          ))}
          {loading && (
            <View style={[styles.bubble, styles.bubbleBot]}>
              <TypingDots />
            </View>
          )}
        </ScrollView>

        {msgs.length <= 1 && (
          <ScrollView
            horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipsRow}
          >
            {SUGGESTIONS.map((s) => (
              <TouchableOpacity
                key={s}
                testID={`asst-chip-${s.slice(0, 8)}`}
                onPress={() => send(s)}
                activeOpacity={0.85}
                style={styles.chip}
              >
                <Ionicons name="flash" size={12} color={Colors.primary} />
                <Text style={styles.chipTxt}>{s}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        <View style={styles.inputRow}>
          <TextInput
            testID="asst-input"
            value={input}
            onChangeText={setInput}
            placeholder="Ask about inflows, overdues, clients…"
            placeholderTextColor={Colors.textMuted}
            style={styles.input}
            onSubmitEditing={() => send()}
            returnKeyType="send"
          />
          <TouchableOpacity
            testID="asst-send"
            onPress={() => send()}
            disabled={loading || !input.trim()}
            activeOpacity={0.85}
            style={[styles.sendBtn, (!input.trim() || loading) && { opacity: 0.5 }]}
          >
            <Ionicons name="send" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  topBar: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.surface, alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: Colors.borderLight, ...Shadows.card,
  },
  title: { fontSize: 17, fontWeight: "800", color: Colors.textPrimary, letterSpacing: -0.2 },
  subtitle: { fontSize: 11.5, color: Colors.textSecondary, marginTop: 2 },

  bubble: {
    maxWidth: "86%", paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: Radii.lg, marginBottom: 10,
  },
  bubbleUser: {
    alignSelf: "flex-end", backgroundColor: Colors.primary,
    borderBottomRightRadius: 4,
  },
  bubbleBot: {
    alignSelf: "flex-start", backgroundColor: Colors.surface,
    borderBottomLeftRadius: 4, borderWidth: 1, borderColor: Colors.borderLight,
  },
  userText: { color: "#fff", fontSize: 14, lineHeight: 20 },
  botText:  { color: Colors.textPrimary, fontSize: 14, lineHeight: 20 },
  botTag: {
    flexDirection: "row", alignItems: "center", gap: 3,
    backgroundColor: Colors.info + "22", alignSelf: "flex-start",
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: Radii.pill, marginBottom: 4,
  },
  botTagTxt: { color: Colors.info, fontSize: 9, fontWeight: "800", letterSpacing: 0.6 },

  chipsRow: { paddingHorizontal: Spacing.md, paddingBottom: 8, gap: 8, flexDirection: "row" },
  chip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: Colors.primary + "15", borderRadius: Radii.pill,
    borderWidth: 1, borderColor: Colors.primary + "33",
    paddingHorizontal: 12, paddingVertical: 8,
  },
  chipTxt: { color: Colors.primary, fontSize: 12, fontWeight: "700" },

  inputRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    padding: Spacing.md,
    borderTopWidth: 1, borderTopColor: Colors.borderLight,
    backgroundColor: Colors.bg,
  },
  input: {
    flex: 1, height: 46, backgroundColor: Colors.surface,
    borderWidth: 1, borderColor: Colors.borderLight, borderRadius: Radii.pill,
    paddingHorizontal: 16, color: Colors.textPrimary, fontSize: 14,
  },
  sendBtn: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: Colors.primary, alignItems: "center", justifyContent: "center",
    ...Shadows.button,
  },
});
