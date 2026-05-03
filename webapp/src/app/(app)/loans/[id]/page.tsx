'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  CheckCircle2,
  Calendar,
  CreditCard,
  Clock,
  AlertCircle,
  Wallet,
  X,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { StatusBadge } from '@/components/StatusBadge';
import { api } from '@/lib/api';
import { classifyLoan } from '@/lib/loanStatus';
import { cn, inr, formatDate, initials } from '@/lib/utils';

type ScheduleEntry = {
  month: number;
  due_date: string;
  amount: number;
  status: 'upcoming' | 'paid' | 'overdue';
  paid_at?: string;
  was_late?: boolean;
};

type Loan = {
  loan_id: string;
  borrower: { name: string; mobile: string };
  principal: number;
  emi_amount?: number;
  interest_rate?: number;
  term_months: number;
  status: string;
  paid_amount: number;
  total_repayment: number;
  purpose?: string;
  created_at: string;
  disbursed_at?: string;
  repayment_schedule: ScheduleEntry[];
};

type Bucket = 'past' | 'current' | 'future';

export default function LoanDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [loan, setLoan] = useState<Loan | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [reschedEntry, setReschedEntry] = useState<ScheduleEntry | null>(null);
  const [reschedDate, setReschedDate] = useState('');

  const load = useCallback(async () => {
    try { setLoan(await api<Loan>(`/loans/${id}`)); }
    catch { /* surface via 404 UI */ }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const badge = useMemo(() => loan ? classifyLoan(loan) : null, [loan]);

  const handleMarkPaid = async (month: number) => {
    if (!loan) return;
    if (!confirm(`Mark month ${month} as paid?`)) return;
    setBusy(`pay-${month}`);
    try {
      const updated = await api<Loan>(`/loans/${loan.loan_id}/repay/${month}`, { method: 'POST' });
      setLoan(updated);
    } catch (e: any) {
      alert(e?.message || 'Mark paid failed');
    } finally { setBusy(null); }
  };

  const handleUndoPay = async (month: number) => {
    if (!loan) return;
    if (!confirm(`Undo payment for month ${month}?`)) return;
    setBusy(`undo-${month}`);
    try {
      const updated = await api<Loan>(`/loans/${loan.loan_id}/undo-pay/${month}`, { method: 'POST' });
      setLoan(updated);
    } catch (e: any) {
      alert(e?.message || 'Undo failed');
    } finally { setBusy(null); }
  };

  const submitReschedule = async () => {
    if (!loan || !reschedEntry || !reschedDate) return;
    setBusy(`resched-${reschedEntry.month}`);
    try {
      const updated = await api<Loan>(`/loans/${loan.loan_id}/reschedule/${reschedEntry.month}`, {
        method: 'POST',
        params: { new_date: reschedDate },
      });
      setLoan(updated);
      setReschedEntry(null);
      setReschedDate('');
    } catch (e: any) {
      alert(e?.message || 'Reschedule failed');
    } finally { setBusy(null); }
  };

  if (!loan) {
    return (
      <div className="flex h-60 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const progress = loan.total_repayment > 0 ? (loan.paid_amount / loan.total_repayment) * 100 : 0;
  const now = Date.now();
  const monthStart = (() => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d.getTime(); })();
  const monthEnd = (() => { const d = new Date(); d.setMonth(d.getMonth() + 1, 1); d.setHours(0, 0, 0, 0); return d.getTime(); })();

  return (
    <div className="space-y-5">
      <button
        onClick={() => router.back()}
        className="inline-flex items-center gap-2 text-sm font-bold text-text-secondary hover:text-text-primary"
      >
        <ArrowLeft size={16} /> Back
      </button>

      {/* Borrower + status card */}
      <Card className="p-5">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-lg font-extrabold text-primary">
            {initials(loan.borrower.name)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xl font-extrabold">{loan.borrower.name}</div>
            <div className="text-xs text-text-muted">+91 {loan.borrower.mobile} · {loan.loan_id.slice(0, 14)}…</div>
          </div>
          {badge && <StatusBadge badge={badge} />}
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          <MetaTile icon={<Wallet size={16} />} label="Principal" value={inr(loan.principal)} />
          <MetaTile icon={<CreditCard size={16} />} label="EMI" value={inr(loan.emi_amount || 0)} />
          <MetaTile icon={<Calendar size={16} />} label="Tenure" value={`${loan.term_months} months`} />
          <MetaTile icon={<Clock size={16} />} label="Interest" value={loan.interest_rate ? `${loan.interest_rate}%` : '—'} />
        </div>

        <div className="mt-5">
          <div className="flex items-center justify-between text-xs text-text-muted">
            <span>Paid {inr(loan.paid_amount)} of {inr(loan.total_repayment)}</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-bg-alt">
            <div
              className={cn('h-full rounded-full',
                badge?.kind === 'overdue_high' ? 'bg-risk-high'
                : badge?.kind === 'overdue_mild' ? 'bg-risk-mild'
                : badge?.kind === 'completed' ? 'bg-primary'
                : 'bg-success'
              )}
              style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
            />
          </div>
        </div>
      </Card>

      {/* Repayment schedule */}
      <Card className="p-0 overflow-hidden">
        <div className="flex items-center justify-between border-b border-border-light px-5 py-4">
          <div>
            <div className="text-xs font-bold uppercase tracking-widest text-text-muted">Schedule</div>
            <div className="text-lg font-bold">Repayment plan</div>
          </div>
          <div className="text-xs text-text-muted">{loan.repayment_schedule.length} EMIs</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 border-b border-border-light bg-bg-alt text-[11px] font-bold uppercase tracking-wider text-text-muted">
              <tr>
                <th className="py-3 pl-5 text-left">#</th>
                <th className="px-3 text-left">Due</th>
                <th className="px-3 text-left">Amount</th>
                <th className="px-3 text-left">Status</th>
                <th className="pr-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-light">
              {loan.repayment_schedule.map((e) => {
                const due = new Date(e.due_date).getTime();
                const isPaid = e.status === 'paid';
                const bucket: Bucket = isPaid
                  ? (due >= monthStart && due < monthEnd ? 'current' : due < monthStart ? 'past' : 'future')
                  : due < now
                    ? (due < monthStart ? 'past' : 'current')
                    : 'future';

                // P0 rule: every unpaid EMI (past or current) must allow Mark Paid + Reschedule.
                const isUnpaid = !isPaid;
                const isLoanOpen = loan.status === 'active';
                const canPay     = isUnpaid && isLoanOpen && bucket !== 'future';
                const canResched = isUnpaid && isLoanOpen && bucket !== 'future';
                const canUndo    = isPaid && loan.status !== 'completed';

                const statusLabel =
                  isPaid ? (e.was_late ? 'Paid (late)' : 'Paid')
                  : bucket === 'past'    ? 'Overdue (prior month)'
                  : bucket === 'current' ? 'Overdue (this month)'
                  : 'Upcoming';
                const statusColor =
                  isPaid ? 'text-success'
                  : bucket === 'past' ? 'text-risk-high'
                  : bucket === 'current' ? 'text-risk-mild'
                  : 'text-text-muted';

                return (
                  <tr key={e.month} className={cn(
                    'transition-colors',
                    !isPaid && bucket === 'past'    && 'bg-risk-highSoft/30',
                    !isPaid && bucket === 'current' && 'bg-risk-mildSoft/30'
                  )}>
                    <td className="py-3 pl-5 font-bold">{e.month}</td>
                    <td className="px-3">{formatDate(e.due_date, 'long')}</td>
                    <td className="px-3 font-bold">{inr(e.amount)}</td>
                    <td className={cn('px-3 font-semibold', statusColor)}>
                      <span className="inline-flex items-center gap-1.5">
                        {isPaid ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                        {statusLabel}
                      </span>
                    </td>
                    <td className="pr-5 text-right">
                      <div className="inline-flex flex-wrap justify-end gap-2">
                        {canPay && (
                          <button
                            onClick={() => handleMarkPaid(e.month)}
                            disabled={busy === `pay-${e.month}`}
                            className="rounded-lg bg-success px-3 py-1.5 text-xs font-bold text-white hover:bg-success/90 disabled:opacity-60"
                          >
                            Mark Paid
                          </button>
                        )}
                        {canResched && (
                          <button
                            onClick={() => { setReschedEntry(e); setReschedDate(e.due_date.slice(0, 10)); }}
                            className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-bold text-text-primary hover:bg-surface-alt"
                          >
                            Reschedule
                          </button>
                        )}
                        {canUndo && (
                          <button
                            onClick={() => handleUndoPay(e.month)}
                            disabled={busy === `undo-${e.month}`}
                            className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-bold text-text-primary hover:bg-surface-alt"
                          >
                            Undo
                          </button>
                        )}
                        {!canPay && !canResched && !canUndo && (
                          <span className="text-xs text-text-muted">—</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Reschedule modal */}
      {reschedEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-md p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-bold uppercase tracking-widest text-text-muted">Reschedule</div>
                <div className="text-lg font-bold">EMI month {reschedEntry.month}</div>
              </div>
              <button
                onClick={() => { setReschedEntry(null); setReschedDate(''); }}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-bg-alt text-text-secondary"
              >
                <X size={16} />
              </button>
            </div>
            <div className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between text-text-secondary">
                <span>Current due</span>
                <span className="font-bold text-text-primary">{formatDate(reschedEntry.due_date, 'long')}</span>
              </div>
              <div className="flex justify-between text-text-secondary">
                <span>Amount</span>
                <span className="font-bold text-text-primary">{inr(reschedEntry.amount)}</span>
              </div>
            </div>
            <label className="mt-4 block text-xs font-bold uppercase tracking-widest text-text-muted">New due date</label>
            <Input
              type="date"
              value={reschedDate}
              onChange={(e) => setReschedDate(e.target.value)}
              className="mt-1"
            />
            <div className="mt-5 flex gap-2">
              <Button variant="secondary" onClick={() => { setReschedEntry(null); setReschedDate(''); }} className="flex-1">Cancel</Button>
              <Button onClick={submitReschedule} loading={busy === `resched-${reschedEntry.month}`} className="flex-1">Reschedule</Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function MetaTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border-light bg-bg-alt p-3">
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-text-muted">
        <span className="text-text-secondary">{icon}</span>
        {label}
      </div>
      <div className="mt-1 text-base font-extrabold">{value}</div>
    </div>
  );
}
