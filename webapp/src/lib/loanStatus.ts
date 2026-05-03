/**
 * Loan status classifier (synced with /app/frontend/src/loanStatus.ts).
 * Rules:
 *   ON_TRACK      — no unpaid past-due EMI
 *   OVERDUE_MILD  — exactly 1 unpaid past-due EMI AND due this month
 *   OVERDUE_HIGH  — >1 missed OR any missed EMI from a prior month
 *   COMPLETED / DEFAULTED — terminal states from loan.status
 */
export type LoanRiskKind =
  | 'on_track'
  | 'overdue_mild'
  | 'overdue_high'
  | 'completed'
  | 'defaulted';

export type LoanBadge = {
  kind: LoanRiskKind;
  label: string;
  longLabel: string;
  overdueCount: number;
  overdueAmount: number;
  /** Tailwind color classes (shared theme variables). */
  chipClasses: string;
  textClass: string;
  ringClass: string;
};

type Schedule = { status?: string; amount?: number; due_date?: string };

function parseDate(v: unknown): Date | null {
  if (!v) return null;
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? null : d;
}

export function classifyLoan(
  loan: { status?: string; repayment_schedule?: Schedule[] } | null | undefined
): LoanBadge {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  if (loan?.status === 'completed') {
    return {
      kind: 'completed',
      label: 'COMPLETED',
      longLabel: 'Fully repaid',
      overdueCount: 0,
      overdueAmount: 0,
      chipClasses: 'bg-primary/10 text-primary ring-primary/20',
      textClass: 'text-primary',
      ringClass: 'ring-primary/30',
    };
  }
  if (loan?.status === 'defaulted') {
    return {
      kind: 'defaulted',
      label: 'DEFAULTED',
      longLabel: 'Defaulted',
      overdueCount: 0,
      overdueAmount: 0,
      chipClasses: 'bg-risk-highSoft text-risk-high ring-risk-highBorder',
      textClass: 'text-risk-high',
      ringClass: 'ring-risk-highBorder',
    };
  }

  let count = 0;
  let amount = 0;
  let hasPrior = false;
  for (const s of loan?.repayment_schedule || []) {
    if (s?.status === 'paid') continue;
    const due = parseDate(s?.due_date);
    if (!due || due >= now) continue;
    count++;
    amount += Number(s?.amount) || 0;
    if (due < monthStart) hasPrior = true;
  }

  if (count === 0) {
    return {
      kind: 'on_track',
      label: 'ON TRACK',
      longLabel: 'On track',
      overdueCount: 0,
      overdueAmount: 0,
      chipClasses: 'bg-success/10 text-success ring-success/20',
      textClass: 'text-success',
      ringClass: 'ring-success/30',
    };
  }

  if (count > 1 || hasPrior) {
    return {
      kind: 'overdue_high',
      label: 'AT RISK',
      longLabel: 'Overdue (high risk)',
      overdueCount: count,
      overdueAmount: amount,
      chipClasses: 'bg-risk-highSoft text-risk-high ring-1 ring-risk-highBorder',
      textClass: 'text-risk-high',
      ringClass: 'ring-risk-highBorder',
    };
  }

  return {
    kind: 'overdue_mild',
    label: 'OVERDUE (MILD)',
    longLabel: 'Overdue (current month)',
    overdueCount: count,
    overdueAmount: amount,
    chipClasses: 'bg-risk-mildSoft text-risk-mild ring-1 ring-risk-mildBorder',
    textClass: 'text-risk-mild',
    ringClass: 'ring-risk-mildBorder',
  };
}
