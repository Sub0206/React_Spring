'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronRight, Search } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { StatusBadge } from '@/components/StatusBadge';
import { api } from '@/lib/api';
import { classifyLoan, type LoanRiskKind, type LoanBadge } from '@/lib/loanStatus';
import { cn, inr, formatDate, initials } from '@/lib/utils';

type Loan = {
  loan_id: string;
  borrower: { name: string; mobile: string };
  principal: number;
  emi_amount?: number;
  paid_amount: number;
  total_repayment: number;
  term_months: number;
  status: string;
  repayment_schedule?: { status?: string; amount?: number; due_date?: string }[];
};

const FILTERS: { k: 'all' | LoanRiskKind; label: string; accent: string }[] = [
  { k: 'all',          label: 'All',            accent: 'text-text-primary' },
  { k: 'on_track',     label: 'On Track',       accent: 'text-success' },
  { k: 'overdue_mild', label: 'Overdue (Mild)', accent: 'text-risk-mild' },
  { k: 'overdue_high', label: 'At Risk',        accent: 'text-risk-high' },
  { k: 'completed',    label: 'Completed',      accent: 'text-primary' },
];

export default function LoansInner() {
  const router = useRouter();
  const search = useSearchParams();
  const initialFilter = (search?.get('filter') as any) || 'all';
  const [filter, setFilter] = useState<'all' | LoanRiskKind>(initialFilter);
  const [q, setQ] = useState('');
  const [loans, setLoans] = useState<Loan[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<'name' | 'amount' | 'due' | 'status'>('due');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  useEffect(() => {
    (async () => {
      try { setLoans(await api<Loan[]>('/loans')); }
      catch {} finally { setLoading(false); }
    })();
  }, []);

  const enriched = useMemo(() =>
    loans.map((l) => ({ loan: l, badge: classifyLoan(l), next: nextDueDate(l) })),
  [loans]);

  const filtered = useMemo(() => {
    let out = enriched;
    if (filter !== 'all') out = out.filter((x) => x.badge.kind === filter);
    const query = q.trim().toLowerCase();
    if (query) {
      out = out.filter((x) =>
        x.loan.borrower.name.toLowerCase().includes(query) ||
        (x.loan.borrower.mobile || '').includes(query) ||
        x.loan.loan_id.toLowerCase().includes(query)
      );
    }
    out = [...out].sort((a, b) => {
      const mult = sortDir === 'asc' ? 1 : -1;
      switch (sortKey) {
        case 'name':   return mult * a.loan.borrower.name.localeCompare(b.loan.borrower.name);
        case 'amount': return mult * ((a.loan.principal || 0) - (b.loan.principal || 0));
        case 'due':    return mult * (((a.next?.getTime() || 0) - (b.next?.getTime() || 0)));
        case 'status': return mult * riskRank(a.badge.kind).localeCompare(riskRank(b.badge.kind));
      }
    });
    return out;
  }, [enriched, filter, q, sortKey, sortDir]);

  const counts = useMemo(() => ({
    all: enriched.length,
    on_track: enriched.filter((e) => e.badge.kind === 'on_track').length,
    overdue_mild: enriched.filter((e) => e.badge.kind === 'overdue_mild').length,
    overdue_high: enriched.filter((e) => e.badge.kind === 'overdue_high').length,
    completed: enriched.filter((e) => e.badge.kind === 'completed').length,
  }), [enriched]);

  const toggleSort = (k: typeof sortKey) => {
    if (sortKey === k) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else { setSortKey(k); setSortDir('asc'); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Loans</h1>
          <p className="text-sm text-text-secondary">{loans.length} total · {counts.overdue_high} at risk</p>
        </div>
        <Link
          href="/loans/new"
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-primary/90"
        >
          + New loan
        </Link>
      </div>

      <Card className="p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="relative flex-1">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <Input
              placeholder="Search by customer, mobile or loan id"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto">
            {FILTERS.map((f) => {
              const active = filter === f.k;
              const n = (counts as any)[f.k];
              return (
                <button
                  key={f.k}
                  onClick={() => setFilter(f.k)}
                  className={cn(
                    'flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold transition-colors',
                    active ? 'border-primary bg-primary/10' : 'border-border-light bg-bg-alt text-text-secondary'
                  )}
                >
                  <span className={active ? f.accent : ''}>{f.label}</span>
                  <span className="rounded-full bg-surface-alt px-2 py-0.5 text-[10px] text-text-muted">{n}</span>
                </button>
              );
            })}
          </div>
        </div>
      </Card>

      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="p-10 text-center text-sm text-text-muted">No loans match your filter.</Card>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border-light bg-surface">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="sticky top-0 z-10 border-b border-border-light bg-bg-alt text-xs font-bold uppercase tracking-widest text-text-muted">
                <tr>
                  <Th onClick={() => toggleSort('name')}   active={sortKey === 'name'}   dir={sortDir} className="pl-4">Customer</Th>
                  <Th onClick={() => toggleSort('amount')} active={sortKey === 'amount'} dir={sortDir}>Loan</Th>
                  <Th>EMI</Th>
                  <Th onClick={() => toggleSort('status')} active={sortKey === 'status'} dir={sortDir}>Status</Th>
                  <Th onClick={() => toggleSort('due')}    active={sortKey === 'due'}    dir={sortDir}>Next Due</Th>
                  <Th className="pr-4 text-right">Action</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-light">
                {filtered.map(({ loan, badge, next }) => (
                  <tr
                    key={loan.loan_id}
                    onClick={() => router.push(`/loans/${loan.loan_id}`)}
                    className="cursor-pointer transition-colors hover:bg-bg-alt"
                  >
                    <td className="py-3 pl-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                          {initials(loan.borrower.name)}
                        </div>
                        <div>
                          <div className="text-sm font-bold">{loan.borrower.name}</div>
                          <div className="text-xs text-text-muted">{loan.loan_id.slice(0, 12)}…</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 text-sm">
                      <div className="font-bold">{inr(loan.principal)}</div>
                      <div className="text-xs text-text-muted">{loan.term_months} mo</div>
                    </td>
                    <td className="px-3 text-sm">{inr(loan.emi_amount || (loan.total_repayment / loan.term_months))}</td>
                    <td className="px-3">
                      <div className="flex flex-col gap-1">
                        <StatusBadge badge={badge} />
                        {badge.overdueCount > 0 && (
                          <span className={cn('text-[11px] font-bold',
                            badge.kind === 'overdue_high' ? 'text-risk-high' : 'text-risk-mild')}>
                            {badge.overdueCount} · {inr(badge.overdueAmount)}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 text-sm">
                      {next ? formatDate(next, 'long') : <span className="text-text-muted">—</span>}
                    </td>
                    <td className="pr-4 text-right">
                      <Link
                        href={`/loans/${loan.loan_id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary hover:bg-primary/20"
                      >
                        View <ChevronRight size={14} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Th({
  children, onClick, active, dir, className,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
  dir?: 'asc' | 'desc';
  className?: string;
}) {
  return (
    <th className={cn('py-3 text-left', onClick && 'cursor-pointer select-none hover:text-text-primary', className)}>
      <button type="button" onClick={onClick} className="inline-flex items-center gap-1">
        {children}
        {active && <span className="text-primary">{dir === 'asc' ? '↑' : '↓'}</span>}
      </button>
    </th>
  );
}

function nextDueDate(l: Loan): Date | null {
  const now = Date.now();
  let candidate: Date | null = null;
  for (const s of l.repayment_schedule || []) {
    if (s.status === 'paid') continue;
    const d = s.due_date ? new Date(s.due_date) : null;
    if (!d) continue;
    if (!candidate || d.getTime() < candidate.getTime()) candidate = d;
  }
  return candidate;
}

function riskRank(k: LoanRiskKind) {
  return { overdue_high: '0', overdue_mild: '1', on_track: '2', completed: '3', defaulted: '4' }[k];
}
