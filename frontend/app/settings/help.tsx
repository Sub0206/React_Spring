import React, { useCallback, useRef, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Radii, Shadows, Spacing } from "../../src/theme";
import { api } from "../../src/api";
import { useI18n } from "../../src/i18n";
import { useThemedStyles } from "../../src/themeContext";

type Msg = { role: "user" | "bot"; text: string; ts: number };

const SUGGESTIONS = [
  "How do I add a new client?",
  "How to issue a new loan?",
  "How does month-wise EMI work?",
  "How to analyze a bank statement?",
  "How to change the language?",
];

export default function HelpChatbot() {
  const styles = useScreenStyles();
  const router = useRouter();
  const { locale } = useI18n();
  const [msgs, setMsgs] = useState<Msg[]>([
    {
      role: "bot",
      text: "Hi! I'm LendIQ Guide. Ask me anything about the app — adding clients, loans, EMIs, reports, settings — and I'll walk you through it.",
      ts: Date.now(),
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const send = useCallback(async (override?: string) => {
    const q = (override ?? input).trim();
    if (!q || loading) return;
    setMsgs((prev) => [...prev, { role: "user", text: q, ts: Date.now() }]);
    setInput("");
    setLoading(true);
    try {
      // Send last 6 messages for context (3 turns)
      const history = msgs.slice(-6).map((m) => ({ role: m.role, text: m.text }));
      const r = await api<{ answer: string; source?: string }>("/support/chat", {
        method: "POST",
        body: { question: q, language: locale, history },
      });
      setMsgs((prev) => [...prev, { role: "bot", text: r.answer || "(no answer)", ts: Date.now() }]);
    } catch (e: any) {
      setMsgs((prev) => [...prev, { role: "bot", text: `I had trouble answering that. ${e?.message || "Please try again."}`, ts: Date.now() }]);
    } finally {
      setLoading(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [input, loading, locale, msgs]);

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} testID="help-back">
          <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Help & Support</Text>
        <View style={styles.botDot} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={{ padding: Spacing.lg, paddingBottom: 20 }}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        >
          {msgs.map((m, i) => (
            <View key={i} style={[styles.bubble, m.role === "user" ? styles.bubbleUser : styles.bubbleBot]}>
              <Text style={[styles.bubbleText, m.role === "user" && { color: "#fff" }]}>{m.text}</Text>
            </View>
          ))}
          {loading && (
            <View style={styles.bubbleBot}>
              <ActivityIndicator size="small" color={Colors.primary} />
            </View>
          )}
          {msgs.length <= 1 && (
            <>
              <Text style={styles.sugTitle}>Try asking:</Text>
              {SUGGESTIONS.map((s, i) => (
                <TouchableOpacity key={i} testID={`sug-${i}`} style={styles.sugBtn} onPress={() => send(s)}>
                  <Ionicons name="sparkles" size={14} color={Colors.primary} />
                  <Text style={styles.sugText}>{s}</Text>
                </TouchableOpacity>
              ))}
            </>
          )}
        </ScrollView>

        <View style={styles.inputRow}>
          <TextInput
            testID="chat-input"
            style={styles.input}
            placeholder="Ask me anything…"
            placeholderTextColor={Colors.textMuted}
            value={input}
            onChangeText={setInput}
            onSubmitEditing={() => send()}
            returnKeyType="send"
            editable={!loading}
          />
          <TouchableOpacity testID="chat-send" onPress={() => send()} style={[styles.sendBtn, (!input.trim() || loading) && { opacity: 0.5 }]} disabled={!input.trim() || loading}>
            <Ionicons name="send" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function useScreenStyles() {
  return useThemedStyles(() => StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  topBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  backBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.surface, alignItems: "center", justifyContent: "center", ...Shadows.card },
  title: { flex: 1, textAlign: "center", fontSize: 18, fontWeight: "800", color: Colors.textPrimary },
  botDot: { width: 44 },
  bubble: { padding: 12, borderRadius: Radii.lg, marginBottom: 8, maxWidth: "86%" },
  bubbleUser: { alignSelf: "flex-end", backgroundColor: Colors.primary, borderBottomRightRadius: 4 },
  bubbleBot:  { alignSelf: "flex-start", backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.borderLight, borderBottomLeftRadius: 4 },
  bubbleText: { fontSize: 14, color: Colors.textPrimary, lineHeight: 20 },
  sugTitle: { marginTop: 8, fontSize: 12, color: Colors.textMuted, fontWeight: "700", letterSpacing: 0.5 },
  sugBtn: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.borderLight, borderRadius: Radii.md, marginTop: 8 },
  sugText: { flex: 1, fontSize: 13, color: Colors.textPrimary, fontWeight: "600" },
  inputRow: { flexDirection: "row", alignItems: "center", gap: 8, padding: Spacing.md, backgroundColor: Colors.surface, borderTopWidth: 1, borderTopColor: Colors.borderLight },
  input: { flex: 1, backgroundColor: Colors.bgAlt, borderRadius: Radii.pill, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: Colors.textPrimary },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.primary, alignItems: "center", justifyContent: "center" },
  }));
}

