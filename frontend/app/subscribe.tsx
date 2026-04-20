import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Modal, Image } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { PrimaryButton, Input } from "../src/ui";
import { Colors, Radii, Shadows, Spacing } from "../src/theme";
import { api } from "../src/api";
import { useAuth } from "../src/auth";

type Plan = { id: string; name: string; price: number; features: string[]; popular?: boolean };

const planColors: Record<string, string> = {
  starter: Colors.primary,
  smart: Colors.secondary,
  prime: Colors.info,
};

const planIcons: Record<string, any> = {
  starter: "rocket",
  smart: "flash",
  prime: "diamond",
};

type PayMethod = "upi" | "card" | "phonepe" | "gpay";

export default function Subscribe() {
  const router = useRouter();
  const { refresh } = useAuth();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [picked, setPicked] = useState<Plan | null>(null);
  const [method, setMethod] = useState<PayMethod>("upi");
  const [loading, setLoading] = useState(false);
  const [showPay, setShowPay] = useState(false);
  const [cardNo, setCardNo] = useState("");
  const [cardName, setCardName] = useState("");
  const [cardExp, setCardExp] = useState("");
  const [cardCvv, setCardCvv] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const r = await api<{ plans: Plan[] }>("/subscriptions/plans", { auth: false });
        setPlans(r.plans);
      } catch (e) { console.log(e); }
    })();
  }, []);

  const openPay = (p: Plan) => { setPicked(p); setShowPay(true); };

  const pay = async () => {
    if (!picked) return;
    if (method === "card" && (cardNo.length < 12 || cardCvv.length < 3)) {
      Alert.alert("Incomplete", "Please enter card details."); return;
    }
    setLoading(true);
    try {
      await new Promise((r) => setTimeout(r, 1200));
      await api("/subscriptions/subscribe", { method: "POST", body: { plan: picked.id, method } });
      await refresh();
      setShowPay(false);
      if (typeof window !== "undefined") {
        // Web: Alert buttons are non-blocking; redirect immediately
        router.replace("/(tabs)/dashboard");
      } else {
        Alert.alert("Payment successful 🎉", `${picked.name} activated for 30 days.`, [
          { text: "Continue", onPress: () => router.replace("/(tabs)/dashboard") },
        ]);
      }
    } catch (e: any) {
      Alert.alert("Payment failed", e.message);
    } finally { setLoading(false); }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={{ padding: Spacing.lg, paddingBottom: Spacing.xxl }}>
        <View style={{ alignItems: "center", marginTop: Spacing.sm }}>
          <View style={styles.emojiCircle}><Text style={{ fontSize: 44 }}>✨</Text></View>
          <Text style={styles.title}>Choose your plan</Text>
          <Text style={styles.sub}>Start lending smarter today.{"\n"}Cancel anytime.</Text>
        </View>

        {plans.map((p) => {
          const tint = planColors[p.id];
          return (
            <View key={p.id} style={[styles.card, p.popular && styles.cardPopular]} testID={`plan-${p.id}`}>
              {p.popular && (
                <View style={styles.popBadge}>
                  <Ionicons name="star" size={10} color="#fff" />
                  <Text style={styles.popText}>MOST POPULAR</Text>
                </View>
              )}
              <View style={[styles.planIcon, { backgroundColor: tint + "1A" }]}>
                <Ionicons name={planIcons[p.id]} size={26} color={tint} />
              </View>
              <Text style={styles.planName}>{p.name}</Text>
              <View style={{ flexDirection: "row", alignItems: "baseline", marginTop: 6 }}>
                <Text style={[styles.planPrice, { color: tint }]}>₹{p.price.toLocaleString()}</Text>
                <Text style={styles.perMonth}>/month</Text>
              </View>
              {p.features.map((f, i) => (
                <View key={i} style={styles.featureRow}>
                  <Ionicons name="checkmark-circle" size={16} color={tint} />
                  <Text style={styles.featureText}>{f}</Text>
                </View>
              ))}
              <View style={{ height: Spacing.md }} />
              <TouchableOpacity
                testID={`subscribe-${p.id}`}
                onPress={() => openPay(p)}
                activeOpacity={0.9}
                style={[styles.subBtn, { backgroundColor: tint }]}
              >
                <Text style={styles.subBtnText}>Subscribe · ₹{p.price.toLocaleString()}</Text>
              </TouchableOpacity>
            </View>
          );
        })}

        <TouchableOpacity testID="skip-subscribe" onPress={() => router.replace("/(tabs)/dashboard")} style={{ alignSelf: "center", marginTop: Spacing.lg }}>
          <Text style={{ color: Colors.textSecondary, fontWeight: "700", textDecorationLine: "underline" }}>Skip for now</Text>
        </TouchableOpacity>
      </ScrollView>

      <Modal visible={showPay} transparent animationType="slide" onRequestClose={() => setShowPay(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.sheetHandle} />
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: Spacing.md }}>
              <Text style={styles.sheetTitle}>Pay ₹{picked?.price.toLocaleString()}</Text>
              <View style={{ flex: 1 }} />
              <TouchableOpacity onPress={() => setShowPay(false)} style={styles.closeBtn}>
                <Ionicons name="close" size={20} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <Text style={styles.sheetSub}>for {picked?.name} · 30 day activation</Text>

            <View style={styles.methodRow}>
              {(["upi", "card", "phonepe", "gpay"] as PayMethod[]).map((m) => (
                <TouchableOpacity
                  key={m}
                  testID={`pay-${m}`}
                  onPress={() => setMethod(m)}
                  style={[styles.methodChip, method === m && styles.methodChipActive]}
                >
                  <Ionicons
                    name={m === "card" ? "card" : m === "upi" ? "qr-code" : "logo-google"}
                    size={14}
                    color={method === m ? "#fff" : Colors.textSecondary}
                  />
                  <Text style={[styles.methodText, method === m && { color: "#fff" }]}>{m.toUpperCase()}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {(method === "upi" || method === "phonepe" || method === "gpay") && (
              <View style={styles.qrBox}>
                <View style={styles.qrInner}>
                  {/* Fake QR pattern */}
                  {Array.from({ length: 16 }).map((_, i) => (
                    <View key={i} style={{ flexDirection: "row" }}>
                      {Array.from({ length: 16 }).map((_, j) => (
                        <View
                          key={j}
                          style={{
                            width: 8, height: 8,
                            backgroundColor: ((i * 31 + j * 17) % 3 === 0) ? "#000" : "#fff",
                          }}
                        />
                      ))}
                    </View>
                  ))}
                </View>
                <Text style={styles.qrLabel}>
                  {method === "upi" ? "Scan with any UPI app" : method === "phonepe" ? "Scan with PhonePe" : "Scan with Google Pay"}
                </Text>
                <Text style={styles.qrHint}>UPI ID: lendiq@hdfcbank</Text>
              </View>
            )}

            {method === "card" && (
              <View>
                <Label text="Card number" />
                <Input testID="card-number" placeholder="1234 5678 9012 3456" keyboardType="number-pad"
                  value={cardNo} onChangeText={(v) => setCardNo(v.replace(/[^0-9]/g, "").slice(0, 16))} maxLength={16} />
                <Label text="Cardholder name" mt />
                <Input testID="card-name" placeholder="Name on card" value={cardName} onChangeText={setCardName} />
                <View style={{ flexDirection: "row", gap: Spacing.sm, marginTop: Spacing.md }}>
                  <View style={{ flex: 1 }}>
                    <Label text="Expiry" />
                    <Input testID="card-exp" placeholder="MM/YY" value={cardExp} onChangeText={setCardExp} maxLength={5} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Label text="CVV" />
                    <Input testID="card-cvv" placeholder="123" keyboardType="number-pad" secureTextEntry
                      value={cardCvv} onChangeText={(v) => setCardCvv(v.replace(/[^0-9]/g, "").slice(0, 4))} maxLength={4} />
                  </View>
                </View>
              </View>
            )}

            <View style={{ height: Spacing.md }} />
            <PrimaryButton testID="pay-now-btn" title={`Pay ₹${picked?.price.toLocaleString()} now`} loading={loading} onPress={pay} />
            <View style={styles.secureRow}>
              <Ionicons name="lock-closed" size={11} color={Colors.textMuted} />
              <Text style={styles.secureText}>256-bit encrypted · Mock demo payment</Text>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Label({ text, mt }: { text: string; mt?: boolean }) {
  return <Text style={[styles.label, mt && { marginTop: Spacing.md }]}>{text}</Text>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  emojiCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: Colors.primary + "15", alignItems: "center", justifyContent: "center" },
  title: { fontSize: 28, fontWeight: "800", color: Colors.textPrimary, marginTop: Spacing.md },
  sub: { color: Colors.textSecondary, textAlign: "center", marginTop: 6, lineHeight: 22 },
  card: { backgroundColor: Colors.surface, borderRadius: Radii.xl, padding: Spacing.lg, marginTop: Spacing.md, ...Shadows.card, borderWidth: 2, borderColor: Colors.borderLight },
  cardPopular: { borderColor: Colors.secondary },
  popBadge: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", backgroundColor: Colors.secondary, paddingHorizontal: 8, paddingVertical: 4, borderRadius: Radii.pill, position: "absolute", top: -10, right: Spacing.lg },
  popText: { color: "#fff", fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  planIcon: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  planName: { fontSize: 20, fontWeight: "800", color: Colors.textPrimary, marginTop: Spacing.sm },
  planPrice: { fontSize: 32, fontWeight: "800", letterSpacing: -0.5 },
  perMonth: { color: Colors.textMuted, fontSize: 14, marginLeft: 4 },
  featureRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 },
  featureText: { color: Colors.textPrimary, fontSize: 13 },
  subBtn: { paddingVertical: 14, borderRadius: Radii.pill, alignItems: "center" },
  subBtnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  modalBackdrop: { flex: 1, backgroundColor: "#00000088", justifyContent: "flex-end" },
  modalSheet: { backgroundColor: Colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: Spacing.lg, paddingBottom: Spacing.xxl },
  sheetHandle: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.border, marginBottom: Spacing.md },
  sheetTitle: { fontSize: 20, fontWeight: "800", color: Colors.textPrimary },
  sheetSub: { color: Colors.textSecondary, fontSize: 13, marginTop: -10, marginBottom: Spacing.md },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.bgAlt, alignItems: "center", justifyContent: "center" },
  methodRow: { flexDirection: "row", gap: 8, flexWrap: "wrap", marginBottom: Spacing.md },
  methodChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radii.pill, backgroundColor: Colors.bgAlt },
  methodChipActive: { backgroundColor: Colors.primary },
  methodText: { fontSize: 12, fontWeight: "800", color: Colors.textSecondary },
  qrBox: { backgroundColor: Colors.bgAlt, borderRadius: Radii.lg, padding: Spacing.lg, alignItems: "center" },
  qrInner: { backgroundColor: "#fff", padding: 8, borderRadius: 12, borderWidth: 4, borderColor: Colors.primary },
  qrLabel: { marginTop: Spacing.md, color: Colors.textPrimary, fontWeight: "700", fontSize: 13 },
  qrHint: { color: Colors.textSecondary, fontSize: 12, marginTop: 4 },
  label: { fontSize: 12, fontWeight: "700", color: Colors.textSecondary, letterSpacing: 0.5, marginBottom: 6 },
  secureRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, marginTop: 12 },
  secureText: { color: Colors.textMuted, fontSize: 11 },
});
