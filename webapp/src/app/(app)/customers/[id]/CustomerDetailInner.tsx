'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  IdCard,
  MapPin,
  Phone,
  Plus,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { classifyLoan } from '@/lib/loanStatus';
import { initials, cn } from '@/lib/utils';

/* ============================================================================
   Customer Detail — strict 1:1 port of the mobile client screen.

   Mobile screen: /app/frontend/app/client/[id].tsx
     1. Primary-coloured hero: avatar + name + mobile + verified mini-chips
     2. KYC card: Aadhaar + PAN rows (with name / DOB / verified tick)
     3. Address card (only if populated)
     4. Loan tracks section header + "New loan" CTA
     5. List of loan tracks (applications) with status badge + AI score
        OR funded loans (filtered from /loans by client_id)

   Desktop-optimised, but BEHAVIOUR matches mobile exactly:
     • Endpoint:      GET /clients/{id}               — single client
     • Endpoint:      GET /clients/{id}/loans         — applications (tracks)
     • Endpoint:      GET /loans                      — merged for funded rows
     • New loan CTA:  router.push('/loans/new?customer={id}')
     • Applications click → /loans/{loan_id} (or application detail if we had one)
     • Funded loan click → /loans/{loan_id}
   ============================================================================ */

type Client = {
  client_id: string;
  name: string;
  mobile: string;
  aadhaar_masked?: string | null;
  aadhaar_name?: string | null;
  aadhaar_verified?: boolean;
  pan?: string | null;
  pan_name?: string | null;
  pan_dob?: string | null;
  pan_verified?: boolean;
  otp_verified?: boolean;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  status?: string;
  reject_reason?: string | null;
  avatar?: string | null;
  created_at?: string;
};

type ApplicationTrack = {
  application_id: string;
  amount: number;
  purpose: string;
  term_months: number;
  status: string;  // "pending" | "approved" | "funded" | "rejected"
  ai_score?: number | null;
  created_at?: string;
};

type LoanLite = {
  loan_id: string;
  client_id?: string | null;
  status: 'active' | 'completed' | 'defaulted';
  principal: number;
  total_repayment: number;
  paid_amount: number;
  emi_amount: number;
  interest_rate: number;
  term_months: number;
  borrower: { name: string; mobile?: string | null };
  repayment_schedule: { month: number; due_date: string; amount: number; status: string; was_late?: boolean }[];
};

type RiskSummaryLite = {
  kind: 'on_track' | 'overdue_mild' | 'overdue_high';
  overdue_count: number;
  overdue_amount: number;
};

// Palette for application statuses (mirrors mobile's statusColor helper)
const APP_STATUS = {
  pending:  { label: 'PENDING',  cls: 'bg-warning/10 text-warning ring-1 ring-warning/20' },
  approved: { label: 'APPROVED', cls: 'bg-info/10 text-info ring-1 ring-info/20' },
  funded:   { label: 'FUNDED',   cls: 'bg-success/10 text-success ring-1 ring-success/20' },
  rejected: { label: 'REJECTED', cls: 'bg-risk-highSoft text-risk-high ring-1 ring-risk-highBorder' },
} as Record<string, { label: string; cls: string }>;

function riskMeta(kind?: string | null) {
  if (kind === 'overdue_high')
    return { label: 'AT RISK', Icon: AlertCircle, cls: 'bg-risk-highSoft text-risk-high ring-1 ring-risk-highBorder' };
  if (kind === 'overdue_mild')
    return { label: 'OVERDUE', Icon: AlertTriangle, cls: 'bg-risk-mildSoft text-risk-mild ring-1 ring-risk-mildBorder' };
  return { label: 'ON TRACK', Icon: CheckCircle2, cls: 'bg-success/10 text-success ring-1 ring-success/20' };
}

function money(n?: number | null) {
  return `₹${Number(n || 0).toLocaleString()}`;
}

export default function CustomerDetailInner() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [client, setClient] = useState<Client | null>(null);
  const [applications, setApplications] = useState<ApplicationTrack[]>([]);
  const [fundedLoans, setFundedLoans] = useState<LoanLite[]>([]);
  const [risk, setRisk] = useState<RiskSummaryLite | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    try {
      const [c, apps, allLoans, riskRes] = await Promise.all([
        api<Client>(`/clients/${id}`),
        api<ApplicationTrack[]>(`/clients/${id}/loans`).catch(() => []),
        api<LoanLite[]>(`/loans`).catch(() => []),
        api<RiskSummaryLite>(`/clients/${id}/risk-summary`).catch(() => null),
      ]);
      setClient(c);
      setApplications(apps);
      setRisk(riskRes);
      // Include funded loans that match this client (mobile doesn't show this explicitly,
      // but the user flow "View loans under that customer" implies we surface them).
      setFundedLoans(
        allLoans.filter(
          (l) =>
            l.client_id === c.client_id ||
            (l.borrower?.mobile && l.borrower.mobile === c.mobile) ||
            l.borrower?.name === c.name,
        ),
      );
    } catch (e: any) {
      setErr(e?.message || 'Failed to load customer.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);

  const totals = useMemo(() => ({
    tracks: applications.length,
    funded: fundedLoans.length,
    active: fundedLoans.filter((l) => l.status === 'active').length,
    completed: fundedLoans.filter((l) => l.status === 'completed').length,
  }), [applications, fundedLoans]);

  const handleDelete = async () => {
    if (!client) return;
    if (!confirm(`Remove ${client.name}? This cannot be undone.`)) return;
    try {
      await api(`/clients/${client.client_id}`, { method: 'DELETE' });
      router.replace('/customers');
    } catch (e: any) {
      alert(e?.message || 'Delete failed.');
    }
  };

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (err || !client) {
    return (
      <div className="space-y-4">
        <Link href="/customers" className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline">
          <ArrowLeft size={16} /> Back to Customers
        </Link>
        <Card className="p-10 text-center text-sm text-risk-high">{err || 'Customer not found.'}</Card>
      </div>
    );
  }

  const r = riskMeta(risk?.kind);
  const fullAddress = [client.address_line1, client.address_line2, client.city, client.state, client.pincode].filter(Boolean).join(', ');

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      {/* Back + delete */}
      <div className="flex items-center justify-between">
        <Link href="/customers" className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline">
          <ArrowLeft size={16} /> Back to Customers
        </Link>
        <button
          onClick={handleDelete}
          className="inline-flex items-center gap-1.5 rounded-lg border border-risk-highBorder bg-risk-highSoft px-3 py-1.5 text-xs font-bold text-risk-high hover:bg-risk-high hover:text-white"
        >
          <Trash2 size={14} /> Remove client
        </button>
      </div>

      {/* === Primary-colour hero (mirrors mobile heroBlock) === */}
      <Card className="overflow-hidden p-0">
        <div className="bg-gradient-to-br from-primary to-primary-dark px-6 py-8 text-white">
          <div className="flex flex-col items-center gap-3">
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-white/20 text-3xl font-black shadow-inner">
              {initials(client.name)}
            </div>
            <div className="text-center">
              <div className="text-2xl font-extrabold tracking-tight">{client.name}</div>
              <div className="mt-1 text-sm opacity-90">+91 {client.mobile}</div>
            </div>
            <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
              {client.aadhaar_verified && <VerifyChip label="Aadhaar" />}
              {client.pan_verified && <VerifyChip label="PAN" />}
              {client.otp_verified && <VerifyChip label="Mobile" />}
              <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-extrabold tracking-wide', r.cls)}>
                <r.Icon size={12} /> {r.label}
              </span>
            </div>
          </div>
        </div>
      </Card>

      {/* === KYC card === */}
      <Card className="p-5">
        <h2 className="mb-3 text-base font-extrabold text-text-primary">KYC documents</h2>
        <div className="divide-y divide-border-light">
          <KycRow
            Icon={IdCard}
            label="Aadhaar"
            value={client.aadhaar_masked || '—'}
            sub={client.aadhaar_name || undefined}
            verified={!!client.aadhaar_verified}
          />
          <KycRow
            Icon={CreditCard}
            label="PAN"
            value={client.pan || '—'}
            sub={
              client.pan_name && client.pan_dob
                ? `${client.pan_name} · DOB ${client.pan_dob}`
                : client.pan_name || undefined
            }
            verified={!!client.pan_verified}
          />
        </div>
      </Card>

      {/* === Address card (only if any address field is present) === */}
      {(client.address_line1 || client.city) && (
        <Card className="p-5">
          <h2 className="mb-3 text-base font-extrabold text-text-primary">Address</h2>
          <div className="flex gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <MapPin size={16} className="text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              {client.address_line1 && <div className="text-sm font-bold text-text-primary">{client.address_line1}</div>}
              {client.address_line2 && <div className="mt-0.5 text-xs text-text-secondary">{client.address_line2}</div>}
              <div className="mt-0.5 text-xs text-text-secondary">
                {[client.city, client.state, client.pincode].filter(Boolean).join(' · ')}
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* === Rejected banner (mirrors mobile) === */}
      {client.status === 'rejected' && client.reject_reason && (
        <Card className="border-warning/40 bg-warning-soft p-4">
          <div className="text-[11px] font-extrabold tracking-widest text-warning">CLIENT REJECTED</div>
          <div className="mt-1 text-sm text-text-primary">{client.reject_reason}</div>
        </Card>
      )}

      {/* === Loan tracks (applications) + New loan button === */}
      <div className="flex items-end justify-between pt-2">
        <div>
          <h2 className="text-xl font-extrabold text-text-primary">Loan tracks</h2>
          <p className="mt-0.5 text-xs text-text-secondary">
            {totals.tracks} {totals.tracks === 1 ? 'application' : 'applications'}
            {totals.funded > 0 && <> · {totals.funded} funded ({totals.active} active, {totals.completed} completed)</>}
          </p>
        </div>
        <Button onClick={() => router.push(`/loans/new?customer=${client.client_id}`)}>
          <Plus size={16} /> New loan
        </Button>
      </div>

      {applications.length === 0 && fundedLoans.length === 0 ? (
        <Card className="p-10 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-bg-alt">
            <CreditCard size={24} className="text-text-muted" />
          </div>
          <div className="text-sm font-bold text-text-primary">No loans yet for {client.name.split(' ')[0]}.</div>
          <div className="mt-1 text-xs text-text-muted">Tap &quot;New loan&quot; to start.</div>
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="divide-y divide-border-light">
            {/* Applications (tracks) first */}
            {applications.map((a) => {
              const meta = APP_STATUS[a.status] ?? APP_STATUS.pending;
              return (
                <button
                  key={a.application_id}
                  onClick={() => router.push(`/loans/${a.application_id}`)}
                  className="group flex w-full items-center gap-4 p-5 text-left transition-colors hover:bg-bg-alt"
                >
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                    <CreditCard size={18} className="text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-base font-extrabold text-text-primary">{money(a.amount)}</span>
                      <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-extrabold tracking-wide', meta.cls)}>
                        {meta.label}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-text-secondary">{a.purpose || 'Loan'} · {a.term_months}mo</div>
                  </div>
                  {a.ai_score != null && (
                    <div className="flex flex-col items-center rounded-lg bg-primary/10 px-2.5 py-1">
                      <div className="text-sm font-extrabold text-primary">{a.ai_score}</div>
                      <div className="text-[9px] font-bold text-primary">AI</div>
                    </div>
                  )}
                  <ChevronRight size={18} className="text-text-muted group-hover:text-text-primary" />
                </button>
              );
            })}

            {/* Funded loans (matched by client_id / mobile / name) */}
            {fundedLoans.map((l) => {
              const badge = classifyLoan(l as any);
              return (
                <Link
                  key={l.loan_id}
                  href={`/loans/${l.loan_id}`}
                  className="group flex w-full items-center gap-4 p-5 text-left transition-colors hover:bg-bg-alt"
                >
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-bg-alt ring-1 ring-border-light">
                    <CreditCard size={18} className="text-text-secondary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-base font-extrabold text-text-primary">{money(l.principal)}</span>
                      <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-extrabold tracking-wide ring-1', badge.chipClasses)}>
                        {badge.label}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-text-secondary">EMI {money(l.emi_amount)} · {l.term_months}mo · {l.interest_rate}%</div>
                  </div>
                  <ChevronRight size={18} className="text-text-muted group-hover:text-text-primary" />
                </Link>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}

// ---------- helpers ----------
function VerifyChip({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-white/25 px-2 py-0.5 text-[11px] font-extrabold text-white">
      <ShieldCheck size={11} /> {label}
    </span>
  );
}

function KycRow({
  Icon,
  label,
  value,
  sub,
  verified,
}: {
  Icon: typeof IdCard;
  label: string;
  value: string;
  sub?: string;
  verified: boolean;
}) {
  return (
    <div className="flex items-center gap-3 py-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
        <Icon size={16} className="text-primary" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-extrabold uppercase tracking-widest text-text-muted">{label}</div>
        <div className="text-sm font-bold text-text-primary">{value}</div>
        {sub && <div className="mt-0.5 text-xs text-text-secondary">{sub}</div>}
      </div>
      {verified && <CheckCircle2 size={20} className="shrink-0 text-success" />}
    </div>
  );
}
