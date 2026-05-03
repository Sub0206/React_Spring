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
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { classifyLoan } from '@/lib/loanStatus';
import { initials, cn } from '@/lib/utils';

// ---------- shared types (kept minimal, matches backend shape) ----------
type Client = {
  client_id: string;
  name: string;
  mobile: string;
  email?: string | null;
  pan?: string | null;
  aadhaar_masked?: string | null;
  pan_verified?: boolean;
  aadhaar_verified?: boolean;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  created_at?: string;
  risk_kind?: 'on_track' | 'overdue_mild' | 'overdue_high' | null;
  risk_overdue_count?: number | null;
  risk_overdue_amount?: number | null;
};

type RiskSummary = {
  kind: 'on_track' | 'overdue_mild' | 'overdue_high';
  overdue_count: number;
  overdue_amount: number;
  active_loan_count: number;
  late_payments: number;
  missed_months: string[];
  missed_months_count: number;
  overdue_loans: { loan_id: string; kind: string; overdue_count: number; overdue_amount: number }[];
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
  funded_at?: string;
  borrower: { name: string; mobile?: string | null };
  repayment_schedule: { month: number; due_date: string; amount: number; status: string; was_late?: boolean }[];
};

function riskHeaderMeta(kind?: string | null) {
  if (kind === 'overdue_high') {
    return {
      label: 'AT RISK',
      Icon: AlertCircle,
      cls: 'bg-risk-highSoft text-risk-high ring-1 ring-risk-highBorder',
      bar: 'bg-risk-high',
    };
  }
  if (kind === 'overdue_mild') {
    return {
      label: 'OVERDUE (MILD)',
      Icon: AlertTriangle,
      cls: 'bg-risk-mildSoft text-risk-mild ring-1 ring-risk-mildBorder',
      bar: 'bg-risk-mild',
    };
  }
  return {
    label: 'ON TRACK',
    Icon: CheckCircle2,
    cls: 'bg-success/10 text-success ring-1 ring-success/20',
    bar: 'bg-success',
  };
}

function money(n?: number | null) {
  const v = Number(n || 0);
  if (v >= 1e7) return `₹${(v / 1e7).toFixed(2)}Cr`;
  if (v >= 1e5) return `₹${(v / 1e5).toFixed(2)}L`;
  if (v >= 1e3) return `₹${(v / 1e3).toFixed(1)}K`;
  return `₹${v.toLocaleString()}`;
}

export default function CustomerDetailInner() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [client, setClient] = useState<Client | null>(null);
  const [risk, setRisk] = useState<RiskSummary | null>(null);
  const [loans, setLoans] = useState<LoanLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [clientList, riskSummary, allLoans] = await Promise.all([
          api<Client[]>('/clients'),
          api<RiskSummary>(`/clients/${id}/risk-summary`).catch(() => null),
          api<LoanLite[]>('/loans'),
        ]);
        const me = clientList.find((c) => c.client_id === id);
        if (!me) {
          setErr('Customer not found.');
        } else {
          setClient(me);
          setRisk(riskSummary || null);
          // Include loans linked by client_id OR matching mobile/name (legacy seed data).
          const mine = allLoans.filter(
            (l) =>
              l.client_id === me.client_id ||
              (l.borrower?.mobile && l.borrower.mobile === me.mobile) ||
              l.borrower?.name === me.name,
          );
          setLoans(mine);
        }
      } catch (e: any) {
        setErr(e?.message || 'Failed to load customer.');
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const totals = useMemo(() => {
    const totalPrincipal = loans.reduce((a, l) => a + (l.principal || 0), 0);
    const totalRepaid = loans.reduce((a, l) => a + (l.paid_amount || 0), 0);
    const totalOutstanding = loans.reduce((a, l) => a + Math.max(0, (l.total_repayment || 0) - (l.paid_amount || 0)), 0);
    const activeCount = loans.filter((l) => l.status === 'active').length;
    const completedCount = loans.filter((l) => l.status === 'completed').length;
    return { totalPrincipal, totalRepaid, totalOutstanding, activeCount, completedCount };
  }, [loans]);

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
        <Link
          href="/customers"
          className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
        >
          <ArrowLeft size={16} /> Back to Customers
        </Link>
        <Card className="p-10 text-center text-sm text-risk-high">{err || 'Customer not found.'}</Card>
      </div>
    );
  }

  const riskKind = risk?.kind || client.risk_kind || 'on_track';
  const r = riskHeaderMeta(riskKind);
  const fullAddress = [client.address_line1, client.address_line2, client.city, client.state, client.pincode]
    .filter(Boolean)
    .join(', ');

  return (
    <div className="space-y-5">
      {/* Breadcrumb back */}
      <Link
        href="/customers"
        className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
      >
        <ArrowLeft size={16} /> Back to Customers
      </Link>

      {/* === Header card: avatar, name, risk badge === */}
      <Card className="p-6">
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-lg font-black text-primary">
              {initials(client.name)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-extrabold tracking-tight">{client.name}</h1>
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-extrabold tracking-wide',
                    r.cls,
                  )}
                >
                  <r.Icon size={12} />
                  {r.label}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-text-secondary">
                <span className="inline-flex items-center gap-1.5"><Phone size={14} /> +91 {client.mobile}</span>
                {client.email && (
                  <span className="inline-flex items-center gap-1.5"><Mail size={14} /> {client.email}</span>
                )}
                {client.pan && (
                  <span className="inline-flex items-center gap-1.5"><IdCard size={14} /> {client.pan}</span>
                )}
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => router.push(`/loans/new?customer=${client.client_id}`)}>
              <CreditCard size={16} /> New loan
            </Button>
          </div>
        </div>
      </Card>

      {/* === Metric tiles === */}
      <div className="grid gap-4 md:grid-cols-4">
        <MetricTile
          label="Active loans"
          value={String(totals.activeCount)}
          subtitle={`${totals.completedCount} completed`}
          Icon={TrendingUp}
          tone="primary"
        />
        <MetricTile
          label="Total principal"
          value={money(totals.totalPrincipal)}
          subtitle="Lifetime funded"
          Icon={Wallet}
          tone="text"
        />
        <MetricTile
          label="Outstanding"
          value={money(totals.totalOutstanding)}
          subtitle={`${money(totals.totalRepaid)} repaid`}
          Icon={CreditCard}
          tone="text"
        />
        <MetricTile
          label={riskKind === 'on_track' ? 'Risk' : 'Overdue'}
          value={
            riskKind === 'on_track'
              ? 'Healthy'
              : `${risk?.overdue_count || client.risk_overdue_count || 0} EMIs`
          }
          subtitle={
            riskKind === 'on_track'
              ? 'No late payments'
              : money(risk?.overdue_amount || client.risk_overdue_amount || 0)
          }
          Icon={riskKind === 'on_track' ? ShieldCheck : AlertTriangle}
          tone={riskKind === 'on_track' ? 'success' : riskKind === 'overdue_mild' ? 'mild' : 'high'}
        />
      </div>

      {/* === Two-column: KYC + Risk breakdown === */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* KYC card */}
        <Card className="p-5 lg:col-span-1">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-extrabold uppercase tracking-widest text-text-secondary">KYC details</h2>
            {client.pan_verified && client.aadhaar_verified && (
              <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-bold text-success ring-1 ring-success/20">
                <ShieldCheck size={12} /> Verified
              </span>
            )}
          </div>
          <dl className="space-y-3 text-sm">
            <KycRow label="PAN" value={client.pan || '—'} verified={client.pan_verified} />
            <KycRow label="Aadhaar" value={client.aadhaar_masked || '—'} verified={client.aadhaar_verified} />
            <KycRow
              label="Address"
              value={fullAddress || '—'}
              Icon={MapPin}
            />
            {client.created_at && (
              <KycRow
                label="Onboarded"
                value={new Date(client.created_at).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' })}
              />
            )}
          </dl>
        </Card>

        {/* Risk breakdown */}
        <Card className="p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-extrabold uppercase tracking-widest text-text-secondary">Risk summary</h2>
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-extrabold tracking-wide',
                r.cls,
              )}
            >
              <r.Icon size={12} /> {r.label}
            </span>
          </div>
          {risk ? (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <RiskStat label="Overdue EMIs" value={String(risk.overdue_count)} tone="high" />
              <RiskStat label="Overdue amount" value={money(risk.overdue_amount)} tone="high" />
              <RiskStat label="Late payments (history)" value={String(risk.late_payments)} tone="mild" />
              <RiskStat label="Missed months" value={String(risk.missed_months_count)} tone="mild" />
              {risk.missed_months.length > 0 && (
                <div className="col-span-2 md:col-span-4 mt-1">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Months missed</div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {risk.missed_months.map((m) => (
                      <span
                        key={m}
                        className="rounded-full bg-risk-mildSoft px-2 py-0.5 text-[11px] font-bold text-risk-mild ring-1 ring-risk-mildBorder"
                      >
                        {m}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-text-secondary">Risk summary not available.</p>
          )}
        </Card>
      </div>

      {/* === All loans of this client === */}
      <Card className="overflow-hidden p-0">
        <div className="flex items-center justify-between border-b border-border-light p-5">
          <div>
            <h2 className="text-sm font-extrabold uppercase tracking-widest text-text-secondary">All loans</h2>
            <p className="mt-0.5 text-xs text-text-muted">{loans.length} total · {totals.activeCount} active · {totals.completedCount} completed</p>
          </div>
        </div>

        {loans.length === 0 ? (
          <div className="p-10 text-center text-sm text-text-muted">No loans funded to this customer yet.</div>
        ) : (
          <div className="divide-y divide-border-light">
            {loans.map((l) => {
              const badge = classifyLoan(l as any);
              const progress = l.total_repayment > 0 ? Math.min(100, (l.paid_amount / l.total_repayment) * 100) : 0;
              const progressBar =
                badge.kind === 'overdue_high' ? 'bg-risk-high'
                : badge.kind === 'overdue_mild' ? 'bg-risk-mild'
                : badge.kind === 'completed' ? 'bg-primary'
                : 'bg-success';
              return (
                <Link
                  key={l.loan_id}
                  href={`/loans/${l.loan_id}`}
                  className="group flex items-center gap-4 p-5 transition-colors hover:bg-bg-alt"
                >
                  <div className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-1 ring-border-light bg-bg-alt', badge.textClass)}>
                    <CreditCard size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold">{l.loan_id}</span>
                      <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-extrabold tracking-wide ring-1', badge.chipClasses)}>
                        {badge.label}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-text-muted">
                      Principal {money(l.principal)} · EMI {money(l.emi_amount)} · {l.term_months}m · {l.interest_rate}%
                    </div>
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-bg-alt">
                      <div className={cn('h-full rounded-full', progressBar)} style={{ width: `${progress}%` }} />
                    </div>
                  </div>
                  <div className="hidden text-right md:block">
                    <div className="text-xs text-text-muted">Paid</div>
                    <div className="text-sm font-bold">{money(l.paid_amount)}</div>
                  </div>
                  <ChevronRight size={18} className="text-text-muted group-hover:text-text-primary" />
                </Link>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

// ---------- sub-components ----------

function MetricTile({
  label, value, subtitle, Icon, tone,
}: {
  label: string; value: string; subtitle: string;
  Icon: typeof CreditCard;
  tone: 'primary' | 'text' | 'success' | 'mild' | 'high';
}) {
  const toneCls = {
    primary: 'text-primary bg-primary/10',
    text:    'text-text-primary bg-bg-alt',
    success: 'text-success bg-success/10',
    mild:    'text-risk-mild bg-risk-mildSoft',
    high:    'text-risk-high bg-risk-highSoft',
  }[tone];
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-extrabold uppercase tracking-widest text-text-muted">{label}</div>
        <div className={cn('flex h-8 w-8 items-center justify-center rounded-lg', toneCls)}>
          <Icon size={14} />
        </div>
      </div>
      <div className="mt-2 text-2xl font-extrabold tracking-tight">{value}</div>
      <div className="mt-0.5 text-xs text-text-muted">{subtitle}</div>
    </Card>
  );
}

function KycRow({
  label, value, verified, Icon,
}: { label: string; value: string; verified?: boolean; Icon?: typeof MapPin }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="shrink-0 text-xs font-bold uppercase tracking-widest text-text-muted">{label}</dt>
      <dd className="flex min-w-0 items-center gap-1.5 text-right text-sm font-semibold text-text-primary">
        {Icon && <Icon size={13} className="shrink-0 text-text-muted" />}
        <span className="truncate">{value}</span>
        {verified && <ShieldCheck size={13} className="shrink-0 text-success" />}
      </dd>
    </div>
  );
}

function RiskStat({ label, value, tone }: { label: string; value: string; tone: 'high' | 'mild' | 'ok' }) {
  const toneCls = {
    high: 'text-risk-high',
    mild: 'text-risk-mild',
    ok:   'text-text-primary',
  }[tone];
  return (
    <div className="rounded-xl bg-bg-alt p-3">
      <div className="text-[10px] font-bold uppercase tracking-widest text-text-muted">{label}</div>
      <div className={cn('mt-1 text-xl font-extrabold', toneCls)}>{value}</div>
    </div>
  );
}
