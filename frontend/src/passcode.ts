/**
 * Passcode helpers (server-driven).
 *
 * The 4-digit passcode is stored ONLY on the backend (`passcode_hash` on the
 * user document). This module exposes thin helpers around the auth API
 * endpoints. The actual unlock state used by the AuthGate is React state
 * inside `auth.tsx` (`sessionUnlocked`) — NOT module state — so passcode
 * verification cleanly triggers re-renders.
 *
 * Removed in this iteration:
 *   - Local SecureStore passcode hash
 *   - Biometric (Touch ID / Face ID) — passcode is the only auth method
 *   - `expo-local-authentication` usage
 *   - Module-scoped `_sessionUnlocked` flag (replaced by React state)
 */
import { api } from "./api";

// ----- API wrappers -----

/**
 * Probe whether a mobile has a server-side passcode. Returns:
 *   - true   → passcode exists (go to passcode-login screen)
 *   - false  → no passcode set (go to OTP / set-passcode flow)
 *   - null   → unknown (network error / CORS / timeout). Caller MUST treat
 *              this as "don't decide yet" — never as "no passcode".
 *
 * Returning a tri-state prevents a flaky network during cold start from
 * accidentally bouncing the user to the "Create passcode" screen.
 */
export async function checkHasPasscode(mobile: string): Promise<boolean | null> {
  try {
    const r = await api<{ has_passcode: boolean }>(
      `/auth/has-passcode?mobile=${encodeURIComponent(mobile)}`,
      { auth: false }
    );
    return !!r.has_passcode;
  } catch {
    return null;
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
