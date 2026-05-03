'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, AlertCircle, AlertTriangle, X } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { api } from '@/lib/api';
import { cn, inr, initials } from '@/lib/utils';

type Client = {
  client_id: string;
  name: string;
  mobile: string;
  pan?: string;
};

type RiskSummary = {
  kind: 'on_track' | 'overdue_mild' | 'overdue_high';
  late_payments: number;
  missed_months: string[];
  missed_months_count: number;
  overdue_count: number;
  overdue_amount: number;
  overdue_loans: { loan_id: string; kind: string; overdue_count: number; overdue_amount: number }[];
  active_loan_count: number;
};

export default function NewLoanInner() {
  const router = useRouter();
  const search = useSearchParams();
  const clientIdParam = search?.get('clientId') || '';

  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState<string>(clientIdParam);
  const [client, setClient] = useState<Client | null>(null);
  const [risk, setRisk] = useState<RiskSummary | null>(null);
  const [riskOpen, setRiskOpen] = useState(false);
  const [riskAck, setRiskAck] = useState(false);

  const [principal, setPrincipal] = useState('');
  const [tenure, setTenure] = useState('12');
  const [rate, setRate] = useState('18');
  const [purpose, setPurpose] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // load clients for the picker
  useEffect(() => {
    (async () => {
      try { setClients(await api<Client[]>('/clients')); } catch {}
    })();
  }, []);

  // when a client is selected, fetch their risk-summary and open modal if needed
  useEffect(() => {
    if (!clientId) return;
    (async () => {
      try {
        const c = clients.find((x) => x.client_id === clientId) || null;
        if (!c) setClient(await api<Client>(`/clients/${clientId}`));
        else setClient(c);
      } catch {}
      try {
        const r = await api<RiskSummary>(`/clients/${clientId}/risk-summary`);
        setRisk(r);
        setRiskAck(r.kind === 'on_track');
        if (r.kind !== 'on_track') setRiskOpen(true);
      } catch {}
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, clients]);

  const emi = useMemo(() => {
    const p = Number(principal);
    const n = Number(tenure);
    const r = Number(rate) / 12 / 100;
    if (!p || !n || !r) return 0;
    return (p * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  }, [principal, tenure, rate]);

  const canSubmit =
    !!clientId && Number(principal) > 0 && Number(tenure) > 0 && Number(rate) > 0 && riskAck;

  const submit = async () => {
    setErr(null);
    if (!canSubmit) return;
    setBusy(true);
    try {
      const res = await api<any>('/loans', {
        method: 'POST',
        body: {
          client_id: clientId,
          principal: Number(principal),
          term_months: Number(tenure),
          interest_rate: Number(rate),
          purpose: purpose || 'General purpose',
        },
      });
      router.replace(`/loans/${res.loan_id || res.id || ''}`);
    } catch (e: any) {
      setErr(e?.message || 'Failed to create loan');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <button
        onClick={() => router.back()}
        className="inline-flex items-center gap-2 text-sm font-bold text-text-secondary hover:text-text-primary"
      >
        <ArrowLeft size={16} /> Back
      </button>

      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">New loan</h1>
        <p className="text-sm text-text-secondary">Pick a customer, then enter loan details.</p>
      </div>

      <Card className="p-5 space-y-4">
        <Field label="Customer">
          <select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="block w-full rounded-xl border-2 border-border bg-surface px-4 py-3 text-[15px] text-text-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="">Select a customer…</option>
            {clients.map((c) => (
              <option key={c.client_id} value={c.client_id}>{c.name} · +91 {c.mobile}</option>
            ))}
          </select>
        </Field>

        {client && (
          <div className="flex items-center gap-3 rounded-xl border border-border-light bg-bg-alt p-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
              {initials(client.name)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold">{client.name}</div>
              <div className="text-xs text-text-muted">+91 {client.mobile}</div>
            </div>
            {risk && risk.kind !== 'on_track' && (
              <button
                onClick={() => setRiskOpen(true)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-extrabold tracking-wider',
                  risk.kind === 'overdue_high'
                    ? 'bg-risk-highSoft text-risk-high ring-1 ring-risk-highBorder'
                    : 'bg-risk-mildSoft text-risk-mild ring-1 ring-risk-mildBorder'
                )}
              >
                {risk.kind === 'overdue_high' ? <AlertCircle size={12} /> : <AlertTriangle size={12} />}
                {risk.kind === 'overdue_high' ? 'AT RISK' : 'OVERDUE'}
              </button>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Field label="Principal (₹)">
            <Input inputMode="numeric" placeholder="e.g. 50000" value={principal} onChange={(e) => setPrincipal(e.target.value.replace(/[^0-9]/g, ''))} />
          </Field>
          <Field label="Tenure (months)">
            <Input inputMode="numeric" placeholder="e.g. 12" value={tenure} onChange={(e) => setTenure(e.target.value.replace(/[^0-9]/g, ''))} />
          </Field>
          <Field label="Interest rate (%/yr)">
            <Input inputMode="decimal" placeholder="e.g. 18" value={rate} onChange={(e) => setRate(e.target.value.replace(/[^0-9.]/g, ''))} />
          </Field>
        </div>

        <Field label="Purpose (optional)">
          <Input placeholder="Working capital, medical, etc." value={purpose} onChange={(e) => setPurpose(e.target.value)} />
        </Field>

        <div className="rounded-xl border border-border-light bg-bg-alt p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-bold text-text-secondary">Monthly EMI (estimate)</span>
            <span className="text-lg font-extrabold">{emi ? inr(emi) : '—'}</span>
          </div>
        </div>

        {err && <div className="text-sm font-semibold text-risk-high">{err}</div>}
        {!riskAck && clientId && risk?.kind !== 'on_track' && (
          <div className="rounded-xl border border-risk-highBorder bg-risk-highSoft p-3 text-xs font-semibold text-risk-high">
            You must acknowledge the risk warning before you can continue.
          </div>
        )}

        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => router.back()} className="flex-1">Cancel</Button>
          <Button onClick={submit} loading={busy} disabled={!canSubmit} className="flex-1">
            Create loan
          </Button>
        </div>
      </Card>

      {/* Risk-warning modal (identical behavior to mobile loan-new screen) */}
      {riskOpen && risk && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <Card className="max-h-[90vh] w-full max-w-lg overflow-y-auto p-6">
            {(() => {
              const isHigh = risk.kind === 'overdue_high';
              const tone = isHigh ? 'risk-high' : 'risk-mild';
              const bgSoft = isHigh ? 'bg-risk-highSoft' : 'bg-risk-mildSoft';
              return (
                <>
                  <div className="flex items-start gap-3">
                    <div className={cn('flex h-11 w-11 items-center justify-center rounded-full', bgSoft, `text-${tone}`)}>
                      {isHigh ? <AlertCircle size={22} /> : <AlertTriangle size={22} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-lg font-extrabold">
                        {isHigh ? 'This borrower is AT RISK' : 'Borrower has OVERDUE EMIs'}
                      </div>
                      <div className="text-xs text-text-secondary">Review before creating a new loan.</div>
                    </div>
                    <button onClick={() => setRiskOpen(false)} className="rounded-full bg-bg-alt p-2 text-text-secondary">
                      <X size={16} />
                    </button>
                  </div>

                  <div className={cn('mt-4 space-y-2 rounded-xl p-4', bgSoft)}>
                    <Row label="Active loans" value={String(risk.active_loan_count)} tone="text-text-primary" />
                    <Row label="Overdue EMIs" value={String(risk.overdue_count)} tone={`text-${tone}`} />
                    <Row label="Overdue amount" value={inr(risk.overdue_amount)} tone={`text-${tone}`} />
                    <Row label="Late payments (history)" value={String(risk.late_payments)} tone="text-text-primary" />
                    {risk.missed_months.length > 0 && (
                      <Row label="Missed months" value={risk.missed_months.join(', ')} tone={`text-${tone}`} />
                    )}
                  </div>

                  {isHigh && risk.overdue_loans.length > 0 && (
                    <div className="mt-4">
                      <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-text-muted">
                        Loans with delays
                      </div>
                      <div className="space-y-1">
                        {risk.overdue_loans.slice(0, 6).map((l) => (
                          <div key={l.loan_id} className="flex items-center justify-between text-xs">
                            <span className="font-semibold text-text-primary">{l.loan_id.slice(0, 14)}…</span>
                            <span className={`font-bold text-${tone}`}>
                              {l.overdue_count} overdue · {inr(l.overdue_amount)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="mt-5 flex flex-col gap-2">
                    <Button
                      variant={isHigh ? 'danger' : 'primary'}
                      onClick={() => { setRiskAck(true); setRiskOpen(false); }}
                      className="w-full"
                    >
                      {isHigh ? 'I understand the risk, continue' : 'Continue anyway'}
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => { setRiskOpen(false); router.back(); }}
                      className="w-full"
                    >
                      Back to customers
                    </Button>
                  </div>
                </>
              );
            })()}
          </Card>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-bold uppercase tracking-widest text-text-muted">{label}</label>
      {children}
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-text-secondary">{label}</span>
      <span className={cn('text-sm font-extrabold text-right', tone)}>{value}</span>
    </div>
  );
}
