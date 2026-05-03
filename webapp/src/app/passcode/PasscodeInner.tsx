'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useAuth } from '@/providers/AuthProvider';
import { setServerPasscode } from '@/lib/auth';
import { cn } from '@/lib/utils';

type Mode = 'login' | 'create' | 'confirm' | 'verify' | 'reset';

export default function PasscodeInner() {
  const router = useRouter();
  const search = useSearchParams();
  const { loginWithPasscode, resetPasscode, setSessionUnlocked, logout, refresh, user } = useAuth();

  const initial = (search?.get('mode') as Mode) || 'verify';
  const mobile = search?.get('mobile') || user?.mobile || '';
  const resetOtp = search?.get('otp') || '';
  const redirect = search?.get('redirect') || '/dashboard';

  const [mode, setMode] = useState<Mode>(initial);
  const [code, setCode] = useState('');
  const [firstCode, setFirstCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const hidden = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => hidden.current?.focus(), 100);
    return () => clearTimeout(t);
  }, [mode]);

  const triggerShake = () => { setShake(true); setTimeout(() => setShake(false), 400); };

  useEffect(() => {
    if (code.length !== 4 || busy) return;
    void submit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  async function submit() {
    setErr(null);
    if (code.length !== 4) return;

    if (mode === 'create') {
      setFirstCode(code);
      setCode('');
      setMode('confirm');
      return;
    }
    if (mode === 'confirm') {
      if (code !== firstCode) {
        triggerShake();
        setErr("Passcodes don't match. Try again.");
        setCode(''); setFirstCode(''); setMode('create');
        return;
      }
      setBusy(true);
      try {
        await setServerPasscode(code);
        setOk('Passcode set ✓');
        setSessionUnlocked(true);
        await refresh();
        setTimeout(() => router.replace(redirect), 450);
      } catch (e: any) {
        setErr(e?.message || "Couldn't set passcode.");
      } finally { setBusy(false); }
      return;
    }
    if (mode === 'login') {
      if (!mobile) { setErr('Missing mobile'); return; }
      setBusy(true);
      try {
        await loginWithPasscode(mobile, code);
        router.replace(redirect);
      } catch (e: any) {
        triggerShake();
        setErr(e?.message || 'Invalid passcode.');
        setCode('');
      } finally { setBusy(false); }
      return;
    }
    if (mode === 'reset') {
      if (!firstCode) { setFirstCode(code); setCode(''); return; }
      if (code !== firstCode) {
        triggerShake();
        setErr("Passcodes don't match. Try again.");
        setCode(''); setFirstCode('');
        return;
      }
      setBusy(true);
      try {
        await resetPasscode(mobile, resetOtp, code);
        setOk('Passcode updated ✓');
        setTimeout(() => router.replace('/dashboard'), 450);
      } catch (e: any) {
        triggerShake();
        setErr(e?.message || 'Reset failed.');
        setCode(''); setFirstCode('');
      } finally { setBusy(false); }
      return;
    }

    setBusy(true);
    try {
      await loginWithPasscode(mobile || user?.mobile || '', code);
      router.replace(redirect);
    } catch (e: any) {
      triggerShake();
      setErr(e?.message || 'Wrong passcode.');
      setCode('');
    } finally { setBusy(false); }
  }

  const title =
    mode === 'verify' ? 'Enter passcode'
    : mode === 'login' ? 'Welcome back'
    : mode === 'reset' ? (firstCode ? 'Confirm new passcode' : 'Create new passcode')
    : mode === 'create' ? 'Create passcode'
    : 'Confirm passcode';

  const subtitle =
    mode === 'verify' ? 'Enter your 4-digit passcode to continue'
    : mode === 'login' ? `Enter your 4-digit passcode for +91 ${mobile}`
    : mode === 'reset' ? (firstCode ? 'Re-enter the new passcode' : 'Set a new 4-digit passcode')
    : mode === 'create' ? 'Set a 4-digit passcode for faster, secure access'
    : 'Re-enter your passcode to confirm';

  const isBack = mode === 'login' || mode === 'reset';
  const ctaLabel =
    mode === 'verify' ? 'Verify'
    : mode === 'login' ? 'Sign in'
    : mode === 'reset' ? (firstCode ? 'Update passcode' : 'Next')
    : mode === 'create' ? 'Next'
    : 'Confirm';

  return (
    <div className="min-h-screen bg-gradient-to-br from-bg via-bg to-primary/5 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-5 flex items-center justify-between">
          {isBack ? (
            <button
              onClick={() => router.replace('/login')}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-surface border border-border-light text-text-primary hover:bg-surface-alt"
            >
              <ChevronLeft size={18} />
            </button>
          ) : <div />}
          {mode === 'verify' && user && (
            <button
              onClick={() => logout()}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-surface border border-border-light text-text-primary hover:bg-surface-alt"
            >
              <LogOut size={18} />
            </button>
          )}
        </div>

        <Card className="p-8">
          <h1 className="text-3xl font-extrabold tracking-tight">{title}</h1>
          <p className="mt-2 text-sm text-text-secondary">{subtitle}</p>

          <div
            className={cn(
              'mt-10 flex justify-center gap-4 transition-transform',
              shake && 'animate-shake'
            )}
          >
            {[0, 1, 2, 3].map((i) => {
              const filled = i < code.length;
              return (
                <div
                  key={i}
                  className={cn(
                    'flex h-14 w-14 items-center justify-center rounded-xl border-2 bg-bg transition-colors',
                    filled ? 'border-primary' : 'border-border',
                    err && 'border-risk-high bg-risk-highSoft'
                  )}
                >
                  {filled && (
                    <div className={cn('h-3 w-3 rounded-full', err ? 'bg-risk-high' : 'bg-primary')} />
                  )}
                </div>
              );
            })}
          </div>

          <input
            ref={hidden}
            value={code}
            onChange={(e) => {
              const d = e.target.value.replace(/[^0-9]/g, '').slice(0, 4);
              setCode(d);
              if (err) setErr(null);
            }}
            inputMode="numeric"
            maxLength={4}
            autoFocus
            className="absolute h-px w-px opacity-0"
            onBlur={() => hidden.current?.focus()}
          />

          {(mode === 'verify' || mode === 'login') && (
            <button
              onClick={() => {
                if (!mobile) return;
                router.replace(`/login?reset=${encodeURIComponent(mobile)}`);
              }}
              className="mt-6 block w-full text-center text-sm font-bold text-primary hover:underline"
            >
              Forgot passcode?
            </button>
          )}

          {err && <div className="mt-4 text-center text-sm font-bold text-risk-high">{err}</div>}
          {ok && <div className="mt-4 text-center text-sm font-bold text-success">{ok}</div>}

          <Button
            onClick={submit}
            disabled={code.length !== 4 || busy}
            loading={busy}
            className="mt-8 w-full"
            size="lg"
          >
            {ctaLabel}
          </Button>
        </Card>
      </div>

      <style jsx global>{`
        @keyframes shake { 0%,100%{transform:translateX(0);} 25%{transform:translateX(-8px);} 50%{transform:translateX(8px);} 75%{transform:translateX(-4px);} }
        .animate-shake { animation: shake 400ms ease-in-out; }
      `}</style>
    </div>
  );
}
