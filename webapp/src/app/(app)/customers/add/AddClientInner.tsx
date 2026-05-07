'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, CheckCircle2, IdCard, Loader2, MapPin, ShieldCheck, User, X,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

/* ============================================================================
   Add Client — strict 1:1 port of mobile `/app/frontend/app/client/add.tsx`.

   4-step wizard with progress bar (matches the mobile heroBar→progressFill):
     1. basic    — name + 10-digit mobile
     2. address  — line1 / line2 / city / state / pincode
     3. aadhaar  — 12 digits → POST /clients/verify-aadhaar (returns name + masked)
     4. pan      — 10 chars  → POST /clients/verify-pan      (returns name + dob)
     done       — POST /clients (final upsert) → navigate to /customers/[id]

   We deliberately skip mobile-OTP-for-client step on the desktop console:
     mobile uses /clients/send-otp + /clients/verify-otp because in-person
     onboarding wants device-side verification. On desktop the lender already
     has Aadhaar+PAN proofs in front of them, so we proceed straight to save.
   ============================================================================ */

type Step = 'basic' | 'address' | 'aadhaar' | 'pan' | 'done';
type ChkStatus = 'idle' | 'checking' | 'ok' | 'err';

export default function AddClientInner() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('basic');

  // Step 1
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');

  // Step 2
  const [line1, setLine1] = useState('');
  const [line2, setLine2] = useState('');
  const [city, setCity]   = useState('');
  const [stateName, setStateName] = useState('');
  const [pincode, setPincode] = useState('');

  // Step 3
  const [aadhaar, setAadhaar] = useState('');
  const [aadhaarStatus, setAadhaarStatus] = useState<ChkStatus>('idle');
  const [aadhaarName, setAadhaarName]     = useState('');
  const [aadhaarMasked, setAadhaarMasked] = useState('');
  const [aadhaarErr, setAadhaarErr]       = useState('');

  // Step 4
  const [pan, setPan]               = useState('');
  const [panStatus, setPanStatus]   = useState<ChkStatus>('idle');
  const [panName, setPanName]       = useState('');
  const [panDob, setPanDob]         = useState('');
  const [panEntity, setPanEntity]   = useState('');
  const [panErr, setPanErr]         = useState('');

  const [saving, setSaving]   = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);

  const sanitize = (v: string, max: number) => v.replace(/[^0-9]/g, '').slice(0, max);
  const sanitizePan = (v: string) => v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);

  const canProceedBasic = name.trim().length >= 2 && mobile.length === 10;

  const verifyAadhaar = async () => {
    if (aadhaar.length !== 12) {
      setAadhaarStatus('err'); setAadhaarErr('Aadhaar must be 12 digits.'); return;
    }
    setAadhaarStatus('checking'); setAadhaarErr('');
    try {
      const res = await api<{ valid: boolean; reason?: string; masked?: string; name?: string }>(
        '/clients/verify-aadhaar', { method: 'POST', auth: false, body: { aadhaar } },
      );
      if (!res.valid) { setAadhaarStatus('err'); setAadhaarErr(res.reason || 'Invalid Aadhaar'); return; }
      setAadhaarStatus('ok'); setAadhaarName(res.name || ''); setAadhaarMasked(res.masked || '');
    } catch (e: any) {
      setAadhaarStatus('err'); setAadhaarErr(e?.message || 'Verification failed.');
    }
  };

  const verifyPan = async () => {
    if (pan.length !== 10) { setPanStatus('err'); setPanErr('PAN must be 10 characters.'); return; }
    setPanStatus('checking'); setPanErr('');
    try {
      const res = await api<{ valid: boolean; reason?: string; entity?: string; name?: string; dob?: string }>(
        '/clients/verify-pan', { method: 'POST', auth: false, body: { pan } },
      );
      if (!res.valid) { setPanStatus('err'); setPanErr(res.reason || 'Invalid PAN'); return; }
      setPanStatus('ok'); setPanName(res.name || ''); setPanDob(res.dob || ''); setPanEntity(res.entity || '');
    } catch (e: any) {
      setPanStatus('err'); setPanErr(e?.message || 'Verification failed.');
    }
  };

  const finalizeSave = async () => {
    setSaving(true);
    try {
      const created = await api<{ client_id: string }>('/clients', {
        method: 'POST',
        body: {
          name: name.trim(), mobile, aadhaar, pan,
          aadhaar_name: aadhaarName,
          pan_name: panName,
          pan_dob: panDob,
          address_line1: line1.trim() || undefined,
          address_line2: line2.trim() || undefined,
          city: city.trim() || undefined,
          state: stateName.trim() || undefined,
          pincode: pincode.trim() || undefined,
        },
      });
      setSavedId(created.client_id);
      setStep('done');
    } catch (e: any) {
      alert(e?.message || 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  const progressPct =
    step === 'basic'   ? 20
    : step === 'address' ? 40
    : step === 'aadhaar' ? 65
    : step === 'pan'     ? 90
    : 100;

  const stepHeading =
    step === 'basic'   ? 'Step 1 · Basic details'
    : step === 'address' ? 'Step 2 · Address'
    : step === 'aadhaar' ? 'Step 3 · Aadhaar KYC'
    : step === 'pan'     ? 'Step 4 · PAN KYC'
    : 'All done!';

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <Link href="/customers" className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline">
          <ArrowLeft size={16} /> Back to Customers
        </Link>
        <button onClick={() => router.replace('/customers')} className="flex h-9 w-9 items-center justify-center rounded-full bg-bg-alt text-text-secondary hover:bg-surface-alt">
          <X size={16} />
        </button>
      </div>

      {/* Hero with progress (mirrors mobile heroBar + progressFill) */}
      <Card className="overflow-hidden p-0">
        <div className="bg-gradient-to-br from-primary to-primary-dark p-6 text-white">
          <div className="text-xs font-bold uppercase tracking-widest opacity-80">Add Client</div>
          <div className="mt-1 text-xl font-extrabold">{stepHeading}</div>
          <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-white/20">
            <div className="h-full rounded-full bg-white transition-all" style={{ width: `${progressPct}%` }} />
          </div>
        </div>
      </Card>

      {/* === STEP 1 — basic === */}
      {step === 'basic' && (
        <Card className="space-y-4 p-6">
          <Hero emoji="👋" title="Let&apos;s onboard your client" sub="Enter basic info. We&apos;ll handle the rest." />
          <Field label="Full name">
            <Input placeholder="e.g. Ravi Kumar" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Mobile number">
            <div className="flex gap-2">
              <div className="flex h-11 items-center rounded-xl border-2 border-border bg-bg-alt px-3 text-sm font-bold">+91</div>
              <Input inputMode="numeric" placeholder="10-digit mobile" maxLength={10} value={mobile} onChange={(e) => setMobile(sanitize(e.target.value, 10))} />
            </div>
          </Field>
          <Button className="w-full" disabled={!canProceedBasic} onClick={() => setStep('address')}>
            Continue
          </Button>
        </Card>
      )}

      {/* === STEP 2 — address === */}
      {step === 'address' && (
        <Card className="space-y-4 p-6">
          <Hero emoji="🏠" title="Client address" sub="Residence on file for KYC." />
          <Field label="Address line 1">
            <Input placeholder="House / flat / street" value={line1} onChange={(e) => setLine1(e.target.value)} />
          </Field>
          <Field label="Address line 2 (optional)">
            <Input placeholder="Area / landmark" value={line2} onChange={(e) => setLine2(e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="City">
              <Input placeholder="Mumbai" value={city} onChange={(e) => setCity(e.target.value)} />
            </Field>
            <Field label="State">
              <Input placeholder="Maharashtra" value={stateName} onChange={(e) => setStateName(e.target.value)} />
            </Field>
          </div>
          <Field label="Pincode">
            <Input inputMode="numeric" placeholder="400001" maxLength={6} value={pincode} onChange={(e) => setPincode(sanitize(e.target.value, 6))} />
          </Field>
          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={() => setStep('basic')}>Back</Button>
            <Button className="flex-1" onClick={() => setStep('aadhaar')}>Continue</Button>
          </div>
        </Card>
      )}

      {/* === STEP 3 — Aadhaar === */}
      {step === 'aadhaar' && (
        <Card className="space-y-4 p-6">
          <Hero emoji="🆔" title="Aadhaar KYC" sub="Enter 12-digit Aadhaar to verify the customer." />
          <Field label="Aadhaar number">
            <div className="flex gap-2">
              <Input inputMode="numeric" placeholder="12 digits" maxLength={12} value={aadhaar} onChange={(e) => { setAadhaar(sanitize(e.target.value, 12)); setAadhaarStatus('idle'); }} />
              <Button variant="secondary" onClick={verifyAadhaar} loading={aadhaarStatus === 'checking'} disabled={aadhaar.length !== 12}>Verify</Button>
            </div>
          </Field>
          {aadhaarStatus === 'ok' && (
            <div className="rounded-xl border border-success/20 bg-success/5 p-4">
              <div className="flex items-center gap-2 text-sm font-bold text-success">
                <CheckCircle2 size={16} /> Aadhaar verified
              </div>
              <div className="mt-2 text-xs text-text-secondary">Name on Aadhaar: <span className="font-bold text-text-primary">{aadhaarName}</span></div>
              <div className="text-xs text-text-secondary">Masked: <span className="font-bold text-text-primary">{aadhaarMasked}</span></div>
            </div>
          )}
          {aadhaarStatus === 'err' && <div className="text-xs font-semibold text-risk-high">{aadhaarErr}</div>}
          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={() => setStep('address')}>Back</Button>
            <Button className="flex-1" disabled={aadhaarStatus !== 'ok'} onClick={() => setStep('pan')}>Continue</Button>
          </div>
        </Card>
      )}

      {/* === STEP 4 — PAN === */}
      {step === 'pan' && (
        <Card className="space-y-4 p-6">
          <Hero emoji="💳" title="PAN KYC" sub="Enter the 10-character PAN — we&apos;ll fetch the registered name + DOB." />
          <Field label="PAN number">
            <div className="flex gap-2">
              <Input placeholder="ABCDE1234F" value={pan} onChange={(e) => { setPan(sanitizePan(e.target.value)); setPanStatus('idle'); }} maxLength={10} />
              <Button variant="secondary" onClick={verifyPan} loading={panStatus === 'checking'} disabled={pan.length !== 10}>Verify</Button>
            </div>
          </Field>
          {panStatus === 'ok' && (
            <div className="rounded-xl border border-success/20 bg-success/5 p-4">
              <div className="flex items-center gap-2 text-sm font-bold text-success">
                <CheckCircle2 size={16} /> PAN verified
              </div>
              <div className="mt-2 text-xs text-text-secondary">Name: <span className="font-bold text-text-primary">{panName}</span></div>
              {panDob && <div className="text-xs text-text-secondary">DOB: <span className="font-bold text-text-primary">{panDob}</span></div>}
              {panEntity && <div className="text-xs text-text-secondary">Entity: <span className="font-bold text-text-primary">{panEntity}</span></div>}
            </div>
          )}
          {panStatus === 'err' && <div className="text-xs font-semibold text-risk-high">{panErr}</div>}
          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={() => setStep('aadhaar')}>Back</Button>
            <Button className="flex-1" loading={saving} disabled={panStatus !== 'ok'} onClick={finalizeSave}>
              <ShieldCheck size={16} /> Save client
            </Button>
          </div>
        </Card>
      )}

      {/* === DONE === */}
      {step === 'done' && (
        <Card className="flex flex-col items-center gap-3 p-10 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success/10">
            <CheckCircle2 size={32} className="text-success" />
          </div>
          <div className="text-xl font-extrabold">Client onboarded!</div>
          <p className="text-sm text-text-secondary">{name} has been added with verified KYC. You can now create loans for them.</p>
          <div className="mt-2 flex gap-3">
            <Button variant="secondary" onClick={() => router.push('/customers')}>Go to customers</Button>
            {savedId && (
              <Button onClick={() => router.push(`/customers/${savedId}`)}>Open client</Button>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

// ---------- helpers ----------
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-[11px] font-extrabold uppercase tracking-widest text-text-muted">{label}</div>
      {children}
    </div>
  );
}

function Hero({ emoji, title, sub }: { emoji: string; title: string; sub: string }) {
  return (
    <div className="flex items-start gap-3 border-b border-border-light pb-4">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-2xl">
        {emoji}
      </div>
      <div>
        <div className="text-sm font-extrabold">{title}</div>
        <div className="mt-0.5 text-xs text-text-secondary">{sub}</div>
      </div>
    </div>
  );
}
