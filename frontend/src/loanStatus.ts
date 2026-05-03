import { Colors } from "./theme";

/**
 * Loan-status classifier (single source of truth for mobile UI).
 *
 * Business rules agreed with the user:
 *   ✅  ON_TRACK       — no unpaid past-due EMI
 *   🟡 OVERDUE_MILD   — exactly ONE unpaid past-due EMI AND its due_date is
 *                        in the CURRENT calendar month
 *   🔴 OVERDUE_HIGH   — unpaid past-due EMI count > 1, OR any unpaid past-due
 *                        EMI is from a PRIOR month (multi-month delinquency)
 *   ✅  COMPLETED      — loan.status === "completed"
 *   🔴 DEFAULTED      — loan.status === "defaulted"
 *
 * Even when classified as HIGH, the loan must stay OPEN — the borrower must
 * still be able to make a payment. This helper is read-only; it does NOT flip
 * the underlying `loan.status` field.
 */
export type LoanRiskKind =
  | "on_track"
  | "overdue_mild"
  | "overdue_high"
  | "completed"
  | "defaulted";

export type LoanRiskBadge = {
  kind: LoanRiskKind;
  /** Short badge text — uppercase. */
  label: string;
  /** Long label for headers / detail pages. */
  longLabel: string;
  /** Foreground text / icon color (theme-reactive). */
  color: string;
  /** Soft background fill for chips. */
  bg: string;
  /** Border for chips. */
  border: string;
  /** Ionicons glyph name. */
  icon:
    | "checkmark-circle"
    | "alert-circle"
    | "warning"
    | "close-circle"
    | "trophy";
  /** Count of unpaid past-due EMIs (for "X overdue" helper text). */
  overdueCount: number;
  /** Sum of unpaid past-due amounts. */
  overdueAmount: number;
};

type Schedule = { status?: string; amount?: number; due_date?: string | Date };

function parseDue(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  try {
    const d = new Date(String(v));
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

function startOfMonthUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

/**
 * Classify a loan based on its repayment schedule and top-level `status`.
 * `schedule` may come from the API as either an array of snake_case entries
 * or — on some detail endpoints — an `overdue_entries` pre-computed list.
 */
export function classifyLoan(
  loan: { status?: string; repayment_schedule?: Schedule[] } | null | undefined
): LoanRiskBadge {
  const nowIso = new Date();
  const thisMonthStart = startOfMonthUTC(nowIso);

  // Terminal states first.
  if (loan?.status === "completed") {
    return {
      kind: "completed",
      label: "COMPLETED",
      longLabel: "Fully repaid",
      color: Colors.success,
      bg: Colors.successSoft,
      border: Colors.successSoft,
      icon: "trophy",
      overdueCount: 0,
      overdueAmount: 0,
    };
  }
  if (loan?.status === "defaulted") {
    return {
      kind: "defaulted",
      label: "DEFAULTED",
      longLabel: "Defaulted",
      color: Colors.riskHigh,
      bg: Colors.riskHighSoft,
      border: Colors.riskHighBorder,
      icon: "close-circle",
      overdueCount: 0,
      overdueAmount: 0,
    };
  }

  const schedule = (loan?.repayment_schedule || []) as Schedule[];
  let overdueCount = 0;
  let overdueAmount = 0;
  let hasPriorMonth = false;

  for (const s of schedule) {
    if (s?.status === "paid") continue;
    const due = parseDue(s?.due_date);
    if (!due || due >= nowIso) continue; // unpaid but not yet past-due
    overdueCount += 1;
    overdueAmount += Number(s?.amount) || 0;
    if (due < thisMonthStart) hasPriorMonth = true;
  }

  if (overdueCount === 0) {
    return {
      kind: "on_track",
      label: "ON TRACK",
      longLabel: "On track",
      color: Colors.success,
      bg: Colors.successSoft,
      border: Colors.successSoft,
      icon: "checkmark-circle",
      overdueCount: 0,
      overdueAmount: 0,
    };
  }

  // HIGH risk — multiple missed OR any past-month unpaid.
  if (overdueCount > 1 || hasPriorMonth) {
    return {
      kind: "overdue_high",
      label: "OVERDUE · HIGH RISK",
      longLabel: "Overdue (high risk)",
      color: Colors.riskHigh,
      bg: Colors.riskHighSoft,
      border: Colors.riskHighBorder,
      icon: "alert-circle",
      overdueCount,
      overdueAmount,
    };
  }

  // Exactly one missed, and it's this month → mild.
  return {
    kind: "overdue_mild",
    label: "OVERDUE · MILD",
    longLabel: "Overdue (current month)",
    color: Colors.riskMild,
    bg: Colors.riskMildSoft,
    border: Colors.riskMildBorder,
    icon: "warning",
    overdueCount,
    overdueAmount,
  };
}
