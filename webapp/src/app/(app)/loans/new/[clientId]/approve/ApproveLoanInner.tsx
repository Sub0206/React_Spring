'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  Image as ImageIcon,
  Loader2,
  X,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { initials, cn } from '@/lib/utils';

/* ============================================================================
   Final loan-approve form. Desktop port of /app/frontend/app/loan-approve/[clientId].tsx.
   Reads the analysis + cibil objects from sessionStorage (set by NewLoanWizardInner)
   and POSTs /loan-apps/approve to actually fund the loan.
   ============================================================================ */

type Client = { client_id: string; name: string; mobile: string; pan?: string | null };

function emiCalc(principal: number, ratePct: number, months: number): number {
  if (months <= 0) return 0;
  if (ratePct <= 0) return Math.round(principal / months);
  const r = ratePct / 100 / 12;
  const emi = (principal * r * Math.pow(1 + r, months)) / (Math.pow(1 + r, months) - 1);
  return Math.round(emi);
}

const DUE_DAYS = [1, 5, 10, 15, 20, 25, 28];

export default function ApproveLoanInner() {
  const { clientId } = useParams<{ clientId: string }>();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [client, setClient] = useState<Client | null>(null);
  const [analysis, setAnalysis] = useState<any | null>(null);
  const [cibil, setCibil] = useState<any | null>(null);

  const [amount, setAmount] = useState('');
  const [term, setTerm] = useState('12');
  const [rate, setRate] = useState('');
  const [dueDay, setDueDay] = useState<number>(5);
  const [proof, setProof] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      try { setClient(await api<Client>(`/clients/${clientId}`)); }
      catch (e: any) { alert(e?.message || 'Failed to load client.'); }
      if (typeof window !== 'undefined') {
        try { setAnalysis(JSON.parse(sessionStorage.getItem(`loan-new:${clientId}:analysis`) || 'null')); } catch {}
        try { setCibil(JSON.parse(sessionStorage.getItem(`loan-new:${clientId}:cibil`) || 'null')); } catch {}
      }
    })();
  }, [clientId]);

  const amt = Number(amount.replace(/[^0-9]/g, '') || 0);
  const months = Number(term || 0);
  const ratePct = Number(rate || 0);
  const emi = useMemo(() => emiCalc(amt, ratePct, months), [amt, ratePct, months]);
  const total = emi * months;

  const onPickProof = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setProof(String(reader.result || ''));
    reader.readAsDataURL(f);
  };

  const submit = async () => {
    if (amt <= 0)    { alert('Enter the loan amount.'); return; }
    if (months <= 0) { alert('Enter the term in months.'); return; }
    setSubmitting(true);
    try {
      await api('/loan-apps/approve', {
        method: 'POST',
        body: {
          client_id: clientId,
          amount: amt,
          term_months: months,
          interest_rate: ratePct,
          due_day: dueDay || undefined,
          proof_image_base64: proof,
          statement_analysis: analysis,
          cibil_report: cibil,
        },
      });
      // Clear session payload + navigate to loans list
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem(`loan-new:${clientId}:analysis`);
        sessionStorage.removeItem(`loan-new:${clientId}:cibil`);
      }
      alert('Loan disbursed successfully.');
      router.replace('/loans');
    } catch (e: any) {
      alert(e?.message || 'Disbursement failed.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!client) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 size={28} className="animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <button onClick={() => router.back()} className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline">
        <ArrowLeft size={16} /> Back
      </button>

      <Card className="overflow-hidden p-0">
        <div className="bg-gradient-to-br from-primary to-primary-dark p-6 text-white">
          <div className="text-xs font-bold uppercase tracking-widest opacity-80">DISBURSE LOAN</div>
          <div className="mt-1 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/20 text-lg font-black">{initials(client.name)}</div>
            <div>
              <div className="text-lg font-extrabold">{client.name}</div>
              <div className="text-sm opacity-90">+91 {client.mobile} {client.pan ? `· ${client.pan}` : ''}</div>
            </div>
          </div>
        </div>
      </Card>

      <Card className="space-y-4 p-6">
        <div>
          <Label>Loan amount</Label>
          <Input
            inputMode="numeric"
            placeholder="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ''))}
            className="text-2xl font-extrabold"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Term (months)</Label>
            <Input inputMode="numeric" placeholder="12" value={term} onChange={(e) => setTerm(e.target.value.replace(/[^0-9]/g, ''))} />
          </div>
          <div>
            <Label>Interest rate (% p.a.)</Label>
            <Input inputMode="decimal" placeholder="14" value={rate} onChange={(e) => setRate(e.target.value.replace(/[^0-9.]/g, ''))} />
          </div>
        </div>

        <div>
          <Label>Due day of month</Label>
          <div className="mt-2 flex flex-wrap gap-2">
            {DUE_DAYS.map((d) => (
              <button
                key={d}
                onClick={() => setDueDay(d)}
                className={cn(
                  'rounded-full border-2 px-4 py-1.5 text-xs font-bold',
                  dueDay === d ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-bg text-text-secondary hover:bg-bg-alt',
                )}
              >
                {d}
              </button>
            ))}
          </div>
        </div>

        {/* Computed EMI breakdown */}
        <div className="rounded-2xl bg-primary/5 p-4">
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Monthly EMI" value={`₹${emi.toLocaleString()}`} />
            <Stat label="Total payable" value={`₹${total.toLocaleString()}`} />
            <Stat label="Interest" value={`₹${Math.max(0, total - amt).toLocaleString()}`} />
          </div>
        </div>

        {/* Proof image */}
        <div>
          <Label>Disbursement proof (optional)</Label>
          <div className="mt-2">
            {proof ? (
              <div className="relative inline-block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={proof} alt="proof" className="max-h-48 rounded-xl border border-border" />
                <button onClick={() => setProof(null)} className="absolute -top-2 -right-2 flex h-7 w-7 items-center justify-center rounded-full bg-risk-high text-white shadow-lg hover:bg-risk-high/90">
                  <X size={14} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex w-full items-center gap-3 rounded-xl border-2 border-dashed border-border bg-bg-alt p-4 text-left hover:bg-surface-alt"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                  <ImageIcon size={18} className="text-primary" />
                </div>
                <div>
                  <div className="text-sm font-bold">Upload UPI screenshot or cash receipt</div>
                  <div className="text-xs text-text-muted">PNG/JPG · Max 5MB</div>
                </div>
              </button>
            )}
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={onPickProof} />
        </div>
      </Card>

      <div className="flex gap-3">
        <Button variant="secondary" className="flex-1" onClick={() => router.back()}>Back</Button>
        <Button className="flex-1 !bg-success hover:!bg-success/90 text-white" loading={submitting} onClick={submit}>
          <CheckCircle2 size={16} /> Disburse loan
        </Button>
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="mb-1.5 text-[11px] font-extrabold uppercase tracking-widest text-text-muted">{children}</div>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] font-extrabold uppercase tracking-widest text-text-muted">{label}</div>
      <div className="mt-0.5 text-base font-extrabold">{value}</div>
    </div>
  );
}
