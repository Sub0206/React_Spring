import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Image, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { Card, PrimaryButton, Input } from "../../src/ui";
import { Colors, Radii, Shadows, Spacing } from "../../src/theme";
import { api } from "../../src/api";
import { useThemedStyles } from "../../src/themeContext";

function emiCalc(principal: number, ratePct: number, months: number): number {
  if (months <= 0) return 0;
  if (ratePct <= 0) return Math.round(principal / months);
  const r = ratePct / 100 / 12;
  const emi = (principal * r * Math.pow(1 + r, months)) / (Math.pow(1 + r, months) - 1);
  return Math.round(emi);
}

export default function LoanApprove() {
  const styles = useScreenStyles();
  const { clientId, analysis, cibil } = useLocalSearchParams<{ clientId: string; analysis?: string; cibil?: string }>();
  const router = useRouter();

  const [amount, setAmount] = useState("");
  const [term, setTerm] = useState("12");
  const [rate, setRate] = useState("");
  const [dueDay, setDueDay] = useState<number | null>(5); // Default: 5th of every month
  const [proof, setProof] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const amt = Number(amount || 0);
  const months = Number(term || 0);
  const ratePct = Number(rate || 0);
  const emi = useMemo(() => emiCalc(amt, ratePct, months), [amt, ratePct, months]);
  const total = emi * months;

  const handleKey = (k: string) => {
    if (k === "back") return setAmount((p) => p.slice(0, -1));
    if (k === "clear") return setAmount("");
    if (k === "000") return setAmount((p) => (p ? p + "000" : "0"));
    if (k === "00") return setAmount((p) => (p ? p + "00" : "0"));
    setAmount((p) => {
      if (p === "" && k === "0") return "0";
      if (p === "0") return k;
      if (p.length >= 9) return p;
      return p + k;
    });
  };

  const pickProof = async (fromCamera: boolean) => {
    try {
      const perm = fromCamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Permission required", `${fromCamera ? "Camera" : "Gallery"} permission denied.`);
        return;
      }
      const opts: ImagePicker.ImagePickerOptions = {
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        base64: true, quality: 0.6, allowsEditing: false,
      };
      const res = fromCamera
        ? await ImagePicker.launchCameraAsync(opts)
        : await ImagePicker.launchImageLibraryAsync(opts);
      if (res.canceled || !res.assets?.[0]) return;
      const b64 = res.assets[0].base64;
      setProof(`data:image/jpeg;base64,${b64}`);
    } catch (e: any) {
      Alert.alert("Failed", e.message);
    }
  };

  const submit = async () => {
    if (amt <= 0) { Alert.alert("Amount required", "Enter the loan amount."); return; }
    if (months <= 0) { Alert.alert("Term required", "Enter term in months."); return; }
    setLoading(true);
    try {
      let stmt: any = null, cib: any = null;
      try { stmt = analysis ? JSON.parse(String(analysis)) : null; } catch {}
      try { cib = cibil ? JSON.parse(String(cibil)) : null; } catch {}
      await api("/loan-apps/approve", {
        method: "POST",
        body: {
          client_id: clientId, amount: amt, term_months: months, interest_rate: ratePct,
          due_day: dueDay || undefined,
          proof_image_base64: proof, statement_analysis: stmt, cibil_report: cib,
        },
      });
      Alert.alert("Loan disbursed 🎉", `₹${amt.toLocaleString()} approved. Repayment schedule created.`, [
        { text: "View loans", onPress: () => router.replace("/(tabs)/loans") },
      ]);
    } catch (e: any) {
      Alert.alert("Failed", e.message);
    } finally { setLoading(false); }
  };

  const keys = [["1","2","3"],["4","5","6"],["7","8","9"],["00","0","back"]];

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.topBar}>
        <TouchableOpacity testID="back-approve" onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.topTitle}>Approve Loan</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: Spacing.lg, paddingBottom: Spacing.xxl }}>
        <Card>
          <Text style={styles.label}>LOAN AMOUNT</Text>
          <Text testID="amount-display" style={styles.bigAmount}>₹{amt.toLocaleString()}</Text>

          <View style={styles.keypad}>
            {keys.map((row, i) => (
              <View key={i} style={styles.keyRow}>
                {row.map((k) => (
                  <TouchableOpacity
                    key={k}
                    testID={`key-${k}`}
                    onPress={() => handleKey(k)}
                    activeOpacity={0.6}
                    style={[styles.key, k === "back" && styles.keyBack]}
                  >
                    {k === "back" ? (
                      <Ionicons name="backspace" size={24} color={Colors.danger} />
                    ) : (
                      <Text style={styles.keyText}>{k}</Text>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            ))}
          </View>
          <TouchableOpacity testID="key-clear" onPress={() => handleKey("clear")} style={styles.clearBtn}>
            <Text style={{ color: Colors.danger, fontWeight: "800", fontSize: 13 }}>Clear</Text>
          </TouchableOpacity>
        </Card>

        <Card style={{ marginTop: Spacing.md }}>
          <View style={{ flexDirection: "row", gap: Spacing.sm }}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>TERM (MONTHS)</Text>
              <Input testID="input-approve-term" keyboardType="number-pad" value={term}
                onChangeText={(v) => setTerm(v.replace(/[^0-9]/g, ""))} maxLength={3} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>RATE (% APR · OPTIONAL)</Text>
              <Input testID="input-approve-rate" keyboardType="numeric" placeholder="0 for no interest" value={rate}
                onChangeText={(v) => setRate(v.replace(/[^0-9.]/g, ""))} maxLength={6} />
            </View>
          </View>

          <View style={styles.emiBox}>
            <View style={{ flex: 1 }}>
              <Text style={styles.emiLabel}>EMI PER MONTH</Text>
              <Text style={styles.emiValue}>₹{emi.toLocaleString()}</Text>
              <Text style={styles.emiSub}>
                {ratePct > 0
                  ? `@ ${ratePct}% APR · Total ₹${total.toLocaleString()}`
                  : `Interest-free · Total ₹${total.toLocaleString()}`}
              </Text>
            </View>
            <Ionicons name="calculator" size={44} color={Colors.primary} />
          </View>
        </Card>

        {/* Monthly Due Date selector */}
        <Card style={{ marginTop: Spacing.md }}>
          <Text style={styles.label}>MONTHLY DUE DATE</Text>
          <Text style={styles.dueHelper}>
            Every month on the {dueDay ? `${dueDay}${dueDay === 1 ? "st" : dueDay === 2 ? "nd" : dueDay === 3 ? "rd" : dueDay > 20 && dueDay % 10 === 1 ? "st" : dueDay > 20 && dueDay % 10 === 2 ? "nd" : dueDay > 20 && dueDay % 10 === 3 ? "rd" : "th"}` : "— (no fixed date)"}
          </Text>
          <View style={styles.dueRow}>
            {[1, 5, 10, 15, 20, 25, 28].map((d) => (
              <TouchableOpacity
                key={d}
                testID={`due-day-${d}`}
                onPress={() => setDueDay(d)}
                style={[styles.dueChip, dueDay === d && styles.dueChipActive]}
              >
                <Text style={[styles.dueChipText, dueDay === d && styles.dueChipTextActive]}>
                  {d}
                </Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              testID="due-day-none"
              onPress={() => setDueDay(null)}
              style={[styles.dueChip, dueDay === null && styles.dueChipActive]}
            >
              <Text style={[styles.dueChipText, dueDay === null && styles.dueChipTextActive, { fontSize: 11 }]}>
                Auto
              </Text>
            </TouchableOpacity>
          </View>
          <View style={styles.dueCustomRow}>
            <Text style={styles.dueCustomLabel}>Or pick any day (1–28):</Text>
            <Input
              testID="due-day-input"
              keyboardType="number-pad"
              value={dueDay ? String(dueDay) : ""}
              placeholder="e.g. 5"
              onChangeText={(v) => {
                const n = parseInt(v.replace(/[^0-9]/g, ""), 10);
                if (isNaN(n)) setDueDay(null);
                else if (n >= 1 && n <= 28) setDueDay(n);
              }}
              maxLength={2}
              style={{ width: 70, textAlign: "center" }}
            />
          </View>
        </Card>

        <Card style={{ marginTop: Spacing.md }}>
          <Text style={styles.label}>PROOF (SCAN / UPLOAD)</Text>
          {proof ? (
            <Image source={{ uri: proof }} style={styles.proofImage} />
          ) : (
            <View style={styles.proofPlaceholder}>
              <Ionicons name="document-outline" size={36} color={Colors.textMuted} />
              <Text style={styles.proofHint}>Aadhaar / cheque / agreement</Text>
            </View>
          )}
          <View style={{ flexDirection: "row", gap: Spacing.sm, marginTop: Spacing.sm }}>
            <View style={{ flex: 1 }}>
              <PrimaryButton testID="scan-proof" title="📷 Scan" variant="secondary" onPress={() => pickProof(true)} />
            </View>
            <View style={{ flex: 1 }}>
              <PrimaryButton testID="upload-proof" title="🖼️ Upload" variant="secondary" onPress={() => pickProof(false)} />
            </View>
          </View>
        </Card>

        <View style={{ height: Spacing.md }} />
        <PrimaryButton
          testID="approve-submit"
          title={`Approve & Disburse ₹${amt.toLocaleString()}`}
          variant="success"
          loading={loading}
          disabled={amt <= 0 || months <= 0}
          onPress={submit}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

function useScreenStyles() {
  return useThemedStyles(() => StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  topBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, backgroundColor: Colors.success },
  backBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  topTitle: { flex: 1, textAlign: "center", fontSize: 18, fontWeight: "800", color: "#fff" },
  label: { fontSize: 11, color: Colors.textMuted, fontWeight: "800", letterSpacing: 0.5, marginBottom: 6 },
  bigAmount: { fontSize: 44, fontWeight: "800", color: Colors.textPrimary, textAlign: "center", letterSpacing: -1, marginVertical: Spacing.sm },
  keypad: { marginTop: Spacing.md },
  keyRow: { flexDirection: "row", gap: 8, marginBottom: 8 },
  key: {
    flex: 1, height: 54, borderRadius: Radii.md,
    backgroundColor: Colors.bgAlt, alignItems: "center", justifyContent: "center",
  },
  keyBack: { backgroundColor: Colors.danger + "15" },
  keyText: { fontSize: 22, fontWeight: "800", color: Colors.textPrimary },
  clearBtn: { alignSelf: "center", marginTop: 8, paddingHorizontal: 14, paddingVertical: 6 },
  emiBox: {
    flexDirection: "row", alignItems: "center", gap: 12,
    marginTop: Spacing.md, padding: Spacing.md,
    backgroundColor: Colors.primary + "0F",
    borderRadius: Radii.lg, borderWidth: 2, borderColor: Colors.primary + "33",
  },
  emiLabel: { fontSize: 11, color: Colors.textMuted, fontWeight: "800", letterSpacing: 0.5 },
  emiValue: { fontSize: 28, fontWeight: "800", color: Colors.primary, marginTop: 2 },
  emiSub: { fontSize: 12, color: Colors.textSecondary, marginTop: 4 },
  proofImage: { width: "100%", height: 160, borderRadius: Radii.md, backgroundColor: Colors.bgAlt },
  proofPlaceholder: {
    width: "100%", height: 120, borderRadius: Radii.md, backgroundColor: Colors.bgAlt,
    alignItems: "center", justifyContent: "center", gap: 6,
    borderWidth: 2, borderStyle: "dashed", borderColor: Colors.border,
  },
  proofHint: { color: Colors.textMuted, fontSize: 12 },
  dueHelper: { color: Colors.textSecondary, fontSize: 13, marginBottom: 10, fontWeight: "600" },
  dueRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  dueChip: {
    paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: Colors.bgAlt, borderRadius: Radii.md, minWidth: 48,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1.5, borderColor: "transparent",
  },
  dueChipActive: { backgroundColor: Colors.primary + "1A", borderColor: Colors.primary },
  dueChipText: { fontSize: 14, fontWeight: "800", color: Colors.textPrimary },
  dueChipTextActive: { color: Colors.primary },
  dueCustomRow: { flexDirection: "row", alignItems: "center", marginTop: 12, gap: 10 },
  dueCustomLabel: { fontSize: 13, color: Colors.textSecondary, flex: 1 },
  }));
}

