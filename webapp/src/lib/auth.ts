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

export type HasPasscode = boolean | null;

/** Probe whether a mobile has a server-side passcode. Returns null on network error. */
export async function checkHasPasscode(mobile: string): Promise<HasPasscode> {
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

export async function sendOtp(mobile: string, purpose: 'signup' | 'login' | 'reset', name?: string) {
  return api<{ demo_otp?: string }>('/auth/send-otp', {
    method: 'POST',
    auth: false,
    body: { mobile, purpose, name },
  });
}

export async function verifyOtp(mobile: string, otp: string) {
  return api<{ access_token: string; user: User; has_passcode?: boolean }>(
    '/auth/verify-otp',
    { method: 'POST', auth: false, body: { mobile, otp } }
  );
}

export async function passcodeLogin(mobile: string, passcode: string) {
  return api<{ access_token: string; user: User }>('/auth/passcode-login', {
    method: 'POST',
    auth: false,
    body: { mobile, passcode },
  });
}

export async function setServerPasscode(passcode: string) {
  return api<{ ok: boolean; has_passcode: boolean }>('/auth/set-passcode', {
    method: 'POST',
    body: { passcode },
  });
}

export async function resetPasscode(mobile: string, otp: string, passcode: string) {
  return api<{ access_token: string; user: User }>('/auth/reset-passcode', {
    method: 'POST',
    auth: false,
    body: { mobile, otp, passcode },
  });
}

export async function me() {
  return api<User>('/auth/me');
}
