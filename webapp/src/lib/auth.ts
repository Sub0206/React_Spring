import { api } from './api';

export type User = {
  user_id: string;
  mobile: string;
  name: string;
  email?: string | null;
  picture?: string | null;
  role: string;
  subscription_plan?: string | null;
  subscription_status?: string | null;
};

/**
 * OTP-ONLY AUTH (as of 2026-05-03)
 * The web app authenticates users via a two-step OTP flow:
 *   1. sendOtp(mobile, 'login'|'signup')  → backend stores an OTP and (in demo) returns it in the response
 *   2. verifyOtp(mobile, otp)             → backend returns JWT + user payload
 *
 * JWT is valid for 30 days. When the token expires, the user is bounced back
 * to /login and must request a new OTP. No passcode fallback exists.
 */

export async function sendOtp(
  mobile: string,
  purpose: 'signup' | 'login' = 'login',
  name?: string,
) {
  return api<{ ok: boolean; mobile: string; demo_otp?: string; message?: string }>(
    '/auth/send-otp',
    { method: 'POST', auth: false, body: { mobile, purpose, name } },
  );
}

export async function verifyOtp(mobile: string, otp: string) {
  // `has_passcode` is a deprecated always-false field kept for backward compat.
  return api<{ access_token: string; user: User; has_passcode?: boolean }>(
    '/auth/verify-otp',
    { method: 'POST', auth: false, body: { mobile, otp } },
  );
}

export async function me() {
  return api<User>('/auth/me');
}
