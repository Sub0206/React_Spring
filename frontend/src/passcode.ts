import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import * as LocalAuthentication from "expo-local-authentication";

// Keys
const PASSCODE_HASH_KEY = "lendiq_passcode_hash";      // SecureStore (native) / AsyncStorage (web fallback)
const BIO_ENABLED_KEY   = "lendiq_biometric_enabled";  // AsyncStorage
const FAIL_COUNT_KEY    = "lendiq_pass_fail_count";    // AsyncStorage
const LOCK_UNTIL_KEY    = "lendiq_pass_lock_until";    // AsyncStorage ISO string

const MAX_FAILS = 5;
const LOCK_MS   = 30_000; // 30-second lock after 5 fails, then doubles

// ---- Cross-platform secure storage (SecureStore not available on web) ----
async function secureGet(k: string): Promise<string | null> {
  if (Platform.OS === "web") return await AsyncStorage.getItem(k);
  try { return await SecureStore.getItemAsync(k); } catch { return null; }
}
async function secureSet(k: string, v: string): Promise<void> {
  if (Platform.OS === "web") { await AsyncStorage.setItem(k, v); return; }
  try { await SecureStore.setItemAsync(k, v); } catch { /* noop */ }
}
async function secureDel(k: string): Promise<void> {
  if (Platform.OS === "web") { await AsyncStorage.removeItem(k); return; }
  try { await SecureStore.deleteItemAsync(k); } catch { /* noop */ }
}

// ---- Hashing ----
async function hashPasscode(code: string): Promise<string> {
  return await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `lendiq::${code}`
  );
}

// ---- Public API ----
export async function hasPasscode(): Promise<boolean> {
  const h = await secureGet(PASSCODE_HASH_KEY);
  return !!h && h.length > 0;
}

export async function setPasscode(code: string): Promise<void> {
  if (!/^[0-9]{4}$/.test(code)) throw new Error("Passcode must be exactly 4 digits");
  const h = await hashPasscode(code);
  await secureSet(PASSCODE_HASH_KEY, h);
  await AsyncStorage.setItem(FAIL_COUNT_KEY, "0");
  await AsyncStorage.removeItem(LOCK_UNTIL_KEY);
}

export async function clearPasscode(): Promise<void> {
  await secureDel(PASSCODE_HASH_KEY);
  await AsyncStorage.setItem(BIO_ENABLED_KEY, "false");
  await AsyncStorage.removeItem(FAIL_COUNT_KEY);
  await AsyncStorage.removeItem(LOCK_UNTIL_KEY);
}

export type VerifyResult =
  | { ok: true }
  | { ok: false; error: "wrong" | "locked"; attemptsLeft?: number; unlockAt?: number };

export async function verifyPasscode(code: string): Promise<VerifyResult> {
  const lockUntilStr = await AsyncStorage.getItem(LOCK_UNTIL_KEY);
  const lockUntil = lockUntilStr ? Number(lockUntilStr) : 0;
  if (lockUntil && Date.now() < lockUntil) {
    return { ok: false, error: "locked", unlockAt: lockUntil };
  }
  const stored = await secureGet(PASSCODE_HASH_KEY);
  if (!stored) return { ok: false, error: "wrong" };
  const h = await hashPasscode(code);
  if (h === stored) {
    await AsyncStorage.setItem(FAIL_COUNT_KEY, "0");
    await AsyncStorage.removeItem(LOCK_UNTIL_KEY);
    return { ok: true };
  }
  // Wrong path — increment fail counter, maybe lock
  const fc = Number((await AsyncStorage.getItem(FAIL_COUNT_KEY)) || "0") + 1;
  await AsyncStorage.setItem(FAIL_COUNT_KEY, String(fc));
  if (fc >= MAX_FAILS) {
    const lockFor = LOCK_MS * Math.pow(2, Math.min(4, fc - MAX_FAILS));
    const until = Date.now() + lockFor;
    await AsyncStorage.setItem(LOCK_UNTIL_KEY, String(until));
    return { ok: false, error: "locked", unlockAt: until };
  }
  return { ok: false, error: "wrong", attemptsLeft: Math.max(0, MAX_FAILS - fc) };
}

// ---- Biometric ----
export async function isBiometricAvailable(): Promise<{ hasHardware: boolean; isEnrolled: boolean; types: string[] }> {
  if (Platform.OS === "web") return { hasHardware: false, isEnrolled: false, types: [] };
  try {
    const hw = await LocalAuthentication.hasHardwareAsync();
    const en = await LocalAuthentication.isEnrolledAsync();
    const supported = await LocalAuthentication.supportedAuthenticationTypesAsync();
    const names = supported.map((t) => {
      if (t === LocalAuthentication.AuthenticationType.FINGERPRINT) return "Fingerprint";
      if (t === LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION) return "Face ID";
      if (t === LocalAuthentication.AuthenticationType.IRIS) return "Iris";
      return "Biometric";
    });
    return { hasHardware: hw, isEnrolled: en, types: names };
  } catch {
    return { hasHardware: false, isEnrolled: false, types: [] };
  }
}

export async function biometricEnabled(): Promise<boolean> {
  return (await AsyncStorage.getItem(BIO_ENABLED_KEY)) === "true";
}
export async function setBiometricEnabled(on: boolean): Promise<void> {
  await AsyncStorage.setItem(BIO_ENABLED_KEY, on ? "true" : "false");
}

export async function promptBiometric(reason = "Unlock LendIQ"): Promise<boolean> {
  if (Platform.OS === "web") return false;
  try {
    const r = await LocalAuthentication.authenticateAsync({
      promptMessage: reason, cancelLabel: "Use passcode",
      disableDeviceFallback: false,
    });
    return !!r.success;
  } catch { return false; }
}
