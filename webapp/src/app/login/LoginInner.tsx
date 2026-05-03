'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Lightbulb, Shield } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { useAuth } from '@/providers/AuthProvider';
import { sendOtp } from '@/lib/auth';

type Step = 'mobile' | 'otp';
type Intent = 'login' | 'signup';

/**
 * OTP-ONLY LOGIN (as of 2026-05-03)
 *
 * Flow:
 *   1. User enters 10-digit mobile (+ name if signing up).
 *   2. POST /auth/send-otp           \u2192 backend stores OTP, returns demo_otp in dev.
 *   3. User enters 6-digit OTP.
 *   4. POST /auth/verify-otp        \u2192 backend returns JWT + user.
 *   5. Webapp saves JWT \u2192 /dashboard.
 *
 * No passcode screen. JWT is valid 30 days. On token expiry the user is
 * bounced back here.
 */
export default function LoginInner() {
  const router = useRouter();
  const { loginWithOtp } = useAuth();

  const [intent, setIntent] = useState<Intent>('login');
  const [step, setStep] = useState<Step>('mobile');
  const [mobile, setMobile] = useState('');
  const [name, setName] = useState('');
  const [otp, setOtp] = useState('');
  const [demoOtp, setDemoOtp] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const sanitizeMobile = (v: string) => v.replace(/[^0-9]/g, '').slice(0, 10);

  const handleSendOtp = async () => {
    setErr(null);
    if (mobile.length !== 10) { setErr('Enter a valid 10-digit mobile.'); return; }
    if (intent === 'signup' && !name.trim()) { setErr('Please enter your name to sign up.'); return; }
    setBusy(true);
    try {
      const r = await sendOtp(mobile, intent, intent === 'signup' ? name.trim() : undefined);
      setDemoOtp(r?.demo_otp || null);
      setStep('otp');
    } catch (e: any) {
      setErr(e?.message || "Couldn't send OTP.");
    } finally {
      setBusy(false);
    }
  };

  const handleVerify = async () => {
    setErr(null);
    if (otp.length < 4) { setErr('Enter the OTP.'); return; }
    setBusy(true);
    try {
      await loginWithOtp(mobile, otp);
      router.replace('/dashboard');
    } catch (e: any) {
      setErr(e?.message || 'OTP verification failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleResendOtp = async () => {
    try {
      const r = await sendOtp(mobile, intent, intent === 'signup' ? name.trim() : undefined);
      setDemoOtp(r?.demo_otp || null);
    } catch (e: any) {
      setErr(e?.message || 'Resend failed.');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-bg via-bg to-primary/5 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-3xl font-black text-white shadow-lg">
            LQ
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight">LendIQ</h1>
          <div className="text-[10px] font-bold tracking-[0.25em] text-text-muted mt-1">POWERED BY SKYNOTECH</div>
          <p className="mt-3 text-sm text-text-secondary">
            Smart lending, powered by AI.<br />
            Review, score &amp; fund loans in seconds.
          </p>
        </div>

        <Card className="mt-6 p-6">
          {step === 'mobile' ? (
            <>
              <div className="mb-5 flex gap-2 rounded-full bg-bg-alt p-1">
                <button
                  onClick={() => setIntent('login')}
                  className={`flex-1 rounded-full py-2 text-sm font-bold ${
                    intent === 'login' ? 'bg-surface text-primary shadow' : 'text-text-secondary'
                  }`}
                >
                  Sign in
                </button>
                <button
                  onClick={() => setIntent('signup')}
                  className={`flex-1 rounded-full py-2 text-sm font-bold ${
                    intent === 'signup' ? 'bg-surface text-primary shadow' : 'text-text-secondary'
                  }`}
                >
                  Sign up
                </button>
              </div>

              {intent === 'signup' && (
                <Input
                  placeholder="Full name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mb-3"
                />
              )}

              <div className="flex gap-2">
                <div className="flex h-12 items-center rounded-xl border-2 border-border bg-bg-alt px-3 text-sm font-bold">
                  +91
                </div>
                <Input
                  inputMode="numeric"
                  placeholder="10-digit mobile"
                  value={mobile}
                  onChange={(e) => setMobile(sanitizeMobile(e.target.value))}
                  maxLength={10}
                />
              </div>

              {err && <div className="mt-3 text-xs font-semibold text-risk-high">{err}</div>}

              <Button className="mt-4 w-full" loading={busy} onClick={handleSendOtp} size="lg">
                Send OTP
              </Button>

              <div className="mt-4 flex items-center gap-2 rounded-xl bg-primary/5 px-3 py-2 text-xs text-text-secondary">
                <Shield size={14} className="shrink-0 text-primary" />
                We&apos;ll send a 6-digit OTP to verify your number. Valid for 5 minutes.
              </div>
            </>
          ) : (
            <>
              <div className="mb-4 flex items-center gap-3">
                <button
                  onClick={() => { setStep('mobile'); setOtp(''); setDemoOtp(null); }}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-bg-alt text-text-secondary hover:text-text-primary"
                >
                  <ChevronLeft size={18} />
                </button>
                <div>
                  <div className="text-lg font-bold">Verify OTP</div>
                  <div className="text-xs text-text-secondary">Sent to +91 {mobile}</div>
                </div>
              </div>

              {demoOtp && (
                <div className="mb-4 flex items-center gap-2 rounded-xl border border-warning/40 bg-warning-soft/70 px-3 py-2 text-xs text-text-primary">
                  <Lightbulb size={14} className="text-warning" />
                  Demo OTP: <span className="font-extrabold">{demoOtp}</span>
                </div>
              )}

              <Input
                inputMode="numeric"
                placeholder="Enter 6-digit OTP"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
                className="mb-3 tracking-[0.4em] text-center text-lg"
              />

              {err && <div className="mb-2 text-xs font-semibold text-risk-high">{err}</div>}

              <Button onClick={handleVerify} loading={busy} className="w-full" size="lg">
                Verify &amp; continue
              </Button>

              <button
                onClick={handleResendOtp}
                className="mt-3 w-full text-sm font-bold text-primary hover:underline"
              >
                Resend OTP
              </button>
            </>
          )}
        </Card>

        <p className="mt-4 text-center text-xs text-text-muted">
          By continuing, you agree to LendIQ&apos;s Terms &amp; Privacy Policy.
        </p>
      </div>
    </div>
  );
}
