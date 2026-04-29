/**
 * Passcode session-state utilities (server-driven).
 *
 * The 4-digit passcode is now stored ONLY on the backend (`passcode_hash` on the
 * user document). This module no longer hashes/stores the passcode locally — it
 * just exposes thin helpers around the auth API endpoints + an in-memory session
 * lock flag used by the AppState resume guard.
 *
 * Removed in this iteration:
 *   - Local SecureStore passcode hash
 *   - Biometric (Touch ID / Face ID) — passcode is the only auth method
 *   - `expo-local-authentication` usage
 */
import { api } from "./api";

// ----- in-memory session unlock flag -----
let _sessionUnlocked = false;
export function isSessionUnlocked(): boolean { return _sessionUnlocked; }
export function markSessionUnlocked(): void { _sessionUnlocked = true; }
export function clearSessionUnlock(): void { _sessionUnlocked = false; }

// ----- API wrappers -----

export async function checkHasPasscode(mobile: string): Promise<boolean> {
  try {
    const r = await api<{ has_passcode: boolean }>(
      `/auth/has-passcode?mobile=${encodeURIComponent(mobile)}`,
      { auth: false }
    );
    return !!r.has_passcode;
  } catch {
    return false;
  }
}

export async function setServerPasscode(passcode: string): Promise<void> {
  if (!/^\d{4}$/.test(passcode)) throw new Error("Passcode must be 4 digits");
  await api<{ ok: boolean; has_passcode: boolean }>("/auth/set-passcode", {
    method: "POST",
    body: { passcode },
  });
}

/** Authenticated check used by the AppState resume lock. Does not issue a new token. */
export async function verifyServerPasscode(passcode: string): Promise<boolean> {
  if (!/^\d{4}$/.test(passcode)) return false;
  try {
    await api<{ ok: boolean }>("/auth/verify-passcode", {
      method: "POST",
      body: { passcode },
    });
    return true;
  } catch {
    return false;
  }
}
