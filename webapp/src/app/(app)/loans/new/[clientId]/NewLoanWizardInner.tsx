'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  Download,
  FileText,
  IdCard,
  Loader2,
  Shield,
  ShieldCheck,
  TrendingUp,
  Upload,
  X,
  XCircle,
} from 'lucide-react';
import { api, getToken } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { initials, cn } from '@/lib/utils';

/* ============================================================================
   New Loan WIZARD — 1:1 desktop port of /app/frontend/app/loan-new/[clientId].tsx
   Steps:  review → upload → analyzing → analysis → cibil → summary
   then route to /loans/new/[clientId]/approve for the disbursement form.

   APIs used (identical to mobile):
     • GET  /clients/{id}
     • GET  /clients/{id}/risk-summary       (P0 risk-warning modal)
     • POST /loan-apps/analyze-statement      { client_id, file_name, file_size, months, file_base64 }
     • POST /loan-apps/check-cibil            { client_id }
     • POST /loan-apps/reject                 { client_id, reason, statement_analysis, cibil_report }
     • GET  /clients/{id}/analysis-report.pdf?months=N   (download PDF)
   ============================================================================ */

type Step = 'review' | 'upload' | 'analyzing' | 'analysis' | 'cibil' | 'summary';

type Client = {
  client_id: string;
  name: string;
  mobile: string;
  aadhaar_masked?: string | null;
  aadhaar_name?: string | null;
  pan?: string | null;
  pan_name?: string | null;
  pan_dob?: string | null;
};

type RiskSummary = {
  kind: 'on_track' | 'overdue_mild' | 'overdue_high';
  late_payments: number;
  missed_months: string[];
  missed_months_count: number;
  overdue_count: number;
  overdue_amount: number;
  active_loan_count: number;
  overdue_loans: { loan_id: string; kind: string; overdue_count: number; overdue_amount: number }[];
};

type Analysis = {
  bounce_risk: 'low' | 'medium' | 'high';
  risk_color: 'green' | 'yellow' | 'red';
  summary: string;
  parse_confidence: 'high' | 'medium' | 'low';
  parse_source: 'parsed' | 'mock';
  rows_extracted?: number;
  bounce_matches_found?: number;
  fraud_checks?: { missing_pages_detected?: boolean; ocr_confidence_pct?: number };
  manual_review_recommended?: boolean;
  total_credit: number;
  total_debit: number;
  avg_balance: number;
  bounced_transactions: number;
  avg_monthly_credit?: number;
  emi_load_pct?: number;
  loan_eligibility?: 'strong' | 'moderate' | 'weak';
  recommended_decision?: 'approve' | 'approve_with_caution' | 'reject';
  suggested_loan_amount?: number;
  suggested_emi?: number;
  repayment_capacity_pct?: number;
  highlights?: string[];
  risk_reasons?: { label: string; severity: 'low' | 'medium' | 'high' }[];
  red_flags?: { title: string; detail: string; severity: 'low' | 'medium' | 'high' }[];
  categories?: { name: string; type: 'credit' | 'debit'; amount: number; share_pct: number }[];
  chart?: { label: string; credit: number; debit: number }[];
};

type Cibil = {
  score: number;
  band: 'excellent' | 'good' | 'fair' | 'poor';
  band_color: 'green' | 'blue' | 'yellow' | 'red';
  on_time_payments_pct: number;
  credit_utilization_pct: number;
};

const RISK_COLOR_CLS: Record<string, string> = {
  green:  'text-success border-success/40 bg-success/5',
  blue:   'text-info border-info/40 bg-info/5',
  yellow: 'text-risk-mild border-risk-mildBorder bg-risk-mildSoft',
  red:    'text-risk-high border-risk-highBorder bg-risk-highSoft',
};
const SEVERITY_CLS: Record<string, string> = {
  low:    'text-success bg-success/10',
  medium: 'text-warning bg-warning/10',
  high:   'text-risk-high bg-risk-highSoft',
};

function money(n?: number | null) {
  return `₹${Number(n || 0).toLocaleString()}`;
}
function moneyShort(n?: number | null) {
  const v = Number(n || 0);
  if (v >= 1e7) return `₹${(v / 1e7).toFixed(2)}Cr`;
  if (v >= 1e5) return `₹${(v / 1e5).toFixed(2)}L`;
  if (v >= 1e3) return `₹${(v / 1e3).toFixed(0)}K`;
  return `₹${v.toLocaleString()}`;
}

export default function NewLoanWizardInner() {
  const { clientId } = useParams<{ clientId: string }>();
  const router = useRouter();

  const [client, setClient] = useState<Client | null>(null);
  const [risk, setRisk] = useState<RiskSummary | null>(null);
  const [step, setStep] = useState<Step>('review');

  const [riskWarnOpen, setRiskWarnOpen] = useState(false);
  const [riskAcknowledged, setRiskAcknowledged] = useState(false);

  const [file, setFile] = useState<{ name: string; size: number; b64?: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [months, setMonths] = useState<3 | 6 | 12>(6);

  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [cibil, setCibil] = useState<Cibil | null>(null);
  const [loadingCibil, setLoadingCibil] = useState(false);

  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [rejecting, setRejecting] = useState(false);

  // ------------- bootstrap: load client + risk summary -------------
  useEffect(() => {
    (async () => {
      try {
        setClient(await api<Client>(`/clients/${clientId}`));
      } catch (e: any) {
        alert(e?.message || 'Couldn’t load client.');
      }
      try {
        const rs = await api<RiskSummary>(`/clients/${clientId}/risk-summary`);
        setRisk(rs);
        if (rs.kind !== 'on_track') setRiskWarnOpen(true);
      } catch { /* non-fatal */ }
    })();
  }, [clientId]);

  // ------------- file upload (browser FileReader) -------------
  const onPickFile = useCallback((evt: React.ChangeEvent<HTMLInputElement>) => {
    const f = evt.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const b64 = result.includes(',') ? result.split(',')[1] : undefined;
      setFile({ name: f.name, size: f.size, b64 });
    };
    reader.readAsDataURL(f);
  }, []);

  // ------------- back navigation honours step order -------------
  const stepBack = useCallback(() => {
    const order: Step[] = ['review', 'upload', 'analyzing', 'analysis', 'cibil', 'summary'];
    const idx = order.indexOf(step);
    if (idx > 0) {
      const prev = order[idx - 1] === 'analyzing' ? order[idx - 2] : order[idx - 1];
      setStep((prev as Step) || 'review');
    } else {
      router.back();
    }
  }, [step, router]);

  // ------------- analyse (POST /loan-apps/analyze-statement) -------------
  const runAnalysis = async () => {
    if (!file) { alert('Please upload a bank statement first.'); return; }
    const minBytes = 40 * 1024 * months;
    if ((file.size || 0) > 0 && (file.size || 0) < minBytes) {
      alert(`Please upload a valid ${months}-month bank statement. The file looks too small to cover ${months} months.`);
      return;
    }
    setStep('analyzing');
    try {
      const res = await api<Analysis & { months_covered_in_file?: number; months_analyzed?: number }>(
        '/loan-apps/analyze-statement',
        {
          method: 'POST',
          body: {
            client_id: clientId,
            file_name: file.name,
            file_size: file.size,
            months,
            file_base64: file.b64,
          },
        },
      );
      const covered = Number(res?.months_covered_in_file || res?.months_analyzed || 0);
      const source = String(res?.parse_source || 'mock');
      if (source === 'parsed' && covered > 0 && covered < months) {
        alert(`The statement only covers ${covered} month(s). We need a full ${months}-month statement.`);
        setStep('upload');
        return;
      }
      setAnalysis(res);
      setStep('analysis');
    } catch (e: any) {
      alert(e?.message || 'Analysis failed.');
      setStep('upload');
    }
  };

  const downloadPdf = useCallback(async () => {
    try {
      const token = getToken();
      const url = `/api/v1/clients/${clientId}/analysis-report.pdf?months=${months}`;
      const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`Download failed (${res.status})`);
      const blob = await res.blob();
      const safeName = (client?.name || 'client').replace(/\s+/g, '_');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `analysis_${safeName}.pdf`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e: any) {
      alert(e?.message || 'Couldn’t download PDF.');
    }
  }, [clientId, months, client]);

  const runCibil = async () => {
    setLoadingCibil(true);
    try {
      const res = await api<Cibil>('/loan-apps/check-cibil', {
        method: 'POST',
        body: { client_id: clientId },
      });
      setCibil(res);
      setStep('summary');
    } catch (e: any) {
      alert(e?.message || 'CIBIL check failed.');
    } finally { setLoadingCibil(false); }
  };

  const goApprove = () => {
    // Stash analysis + CIBIL in sessionStorage so the approve page can pick them up
    // without bloating the URL.
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(`loan-new:${clientId}:analysis`, JSON.stringify(analysis || {}));
      window.sessionStorage.setItem(`loan-new:${clientId}:cibil`, JSON.stringify(cibil || {}));
    }
    router.push(`/loans/new/${clientId}/approve`);
  };

  const submitReject = async () => {
    if (!rejectReason.trim()) { alert('Please enter a rejection reason.'); return; }
    setRejecting(true);
    try {
      await api('/loan-apps/reject', {
        method: 'POST',
        body: {
          client_id: clientId,
          reason: rejectReason.trim(),
          statement_analysis: analysis,
          cibil_report: cibil,
        },
      });
      setRejectOpen(false);
      alert('Client rejected.');
      router.replace('/customers');
    } catch (e: any) {
      alert(e?.message || 'Reject failed.');
    } finally { setRejecting(false); }
  };

  const stepIndex: Record<Step, number> = { review: 0, upload: 1, analyzing: 2, analysis: 2, cibil: 3, summary: 4 };
  const stepLabels = ['Review', 'Upload', 'Analyze', 'CIBIL', 'Summary'];

  if (!client) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 size={28} className="animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <button onClick={stepBack} className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline">
          <ArrowLeft size={16} /> Back
        </button>
        <Link href={`/customers/${clientId}`} className="text-sm font-semibold text-text-muted hover:text-text-primary">
          Cancel
        </Link>
      </div>

      {/* Hero with stepper */}
      <Card className="overflow-hidden p-0">
        <div className="bg-gradient-to-br from-primary to-primary-dark p-6 text-white">
          <div className="text-xs font-bold uppercase tracking-widest opacity-80">New Loan</div>
          <div className="mt-1 text-xl font-extrabold">{client.name}</div>
          <div className="text-sm opacity-90">+91 {client.mobile}</div>
          <div className="mt-5 flex items-center gap-2">
            {stepLabels.map((label, i) => {
              const active = stepIndex[step] >= i;
              const done = stepIndex[step] > i;
              return (
                <div key={label} className="flex flex-1 items-center gap-2">
                  <div className={cn(
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold',
                    done ? 'bg-white text-primary'
                      : active ? 'bg-white/95 text-primary ring-2 ring-white/40'
                      : 'bg-white/20 text-white',
                  )}>
                    {done ? '✓' : i + 1}
                  </div>
                  <span className={cn('text-xs font-bold whitespace-nowrap', active ? 'opacity-100' : 'opacity-70')}>{label}</span>
                  {i < stepLabels.length - 1 && (
                    <div className={cn('h-0.5 flex-1', stepIndex[step] > i ? 'bg-white' : 'bg-white/30')} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      {/* === STEP 1 — REVIEW === */}
      {step === 'review' && (
        <Card className="space-y-4 p-6">
          <div>
            <h1 className="text-2xl font-extrabold">Client summary</h1>
            <p className="text-sm text-text-secondary">Verify client details before starting the loan.</p>
          </div>
          <div className="flex items-center gap-3 rounded-xl bg-bg-alt p-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-white font-black">{initials(client.name)}</div>
            <div>
              <div className="font-extrabold">{client.name}</div>
              <div className="text-xs text-text-secondary">+91 {client.mobile}</div>
            </div>
          </div>
          <Kv Icon={IdCard} label="Aadhaar" value={client.aadhaar_masked || '—'} sub={client.aadhaar_name || undefined} />
          <Kv Icon={CreditCard} label="PAN" value={client.pan || '—'} sub={client.pan_name && client.pan_dob ? `${client.pan_name} · DOB ${client.pan_dob}` : client.pan_name || undefined} />
          <Button className="w-full" disabled={risk?.kind !== 'on_track' && !riskAcknowledged} onClick={() => setStep('upload')}>
            Continue
          </Button>
          {risk?.kind !== 'on_track' && !riskAcknowledged && (
            <p className="mt-2 text-center text-xs text-risk-high">Acknowledge the risk warning to continue.</p>
          )}
        </Card>
      )}

      {/* === STEP 2 — UPLOAD === */}
      {step === 'upload' && (
        <Card className="space-y-5 p-6">
          <div>
            <h1 className="text-2xl font-extrabold">Upload bank statement</h1>
            <p className="text-sm text-text-secondary">Pick a period and upload the client&apos;s statement (PDF or image).</p>
          </div>

          <div>
            <Label>Period</Label>
            <div className="mt-2 flex gap-2">
              {([3, 6, 12] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMonths(m)}
                  className={cn(
                    'flex-1 rounded-xl border-2 px-4 py-3 text-sm font-bold transition-colors',
                    months === m ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-bg text-text-secondary hover:bg-bg-alt',
                  )}
                >
                  {m} months
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              'flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed p-8 transition-colors',
              file ? 'border-primary bg-primary/5' : 'border-border bg-bg-alt hover:bg-surface-alt',
            )}
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
              <Upload size={26} className="text-primary" />
            </div>
            {file ? (
              <>
                <div className="text-base font-extrabold">{file.name}</div>
                <div className="text-xs text-text-secondary">{(file.size / 1024).toFixed(1)} KB · Click to replace</div>
              </>
            ) : (
              <>
                <div className="text-base font-extrabold">Click to upload</div>
                <div className="text-xs text-text-secondary">PDF or image · Max 10MB</div>
              </>
            )}
          </button>
          <input ref={fileInputRef} type="file" accept="application/pdf,image/*" hidden onChange={onPickFile} />

          <Button onClick={runAnalysis} disabled={!file} className="w-full">
            <Activity size={16} /> Analyze statement
          </Button>
        </Card>
      )}

      {/* === STEP 3 — ANALYZING (transient) === */}
      {step === 'analyzing' && (
        <Card className="flex flex-col items-center gap-3 p-12 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <Activity size={28} className="text-primary" />
          </div>
          <Loader2 size={24} className="animate-spin text-primary" />
          <div className="text-lg font-extrabold">Analyzing statement…</div>
          <div className="text-sm text-text-secondary">Our AI is reviewing credits, debits and bounce history.</div>
        </Card>
      )}

      {/* === STEP 4 — ANALYSIS RESULTS === */}
      {step === 'analysis' && analysis && (
        <div className="space-y-4">
          {/* Bounce risk hero */}
          <div className={cn('flex items-center gap-3 rounded-2xl border-2 p-5', RISK_COLOR_CLS[analysis.risk_color] || RISK_COLOR_CLS.yellow)}>
            <div className="h-12 w-2 shrink-0 rounded-full bg-current" />
            <div className="flex-1">
              <div className="text-[10px] font-extrabold uppercase tracking-widest opacity-70">BOUNCE RISK</div>
              <div className="mt-0.5 text-xl font-extrabold">{String(analysis.bounce_risk).toUpperCase()}</div>
              <div className="mt-1 text-sm text-text-secondary">{analysis.summary}</div>
            </div>
          </div>

          {/* Why this risk */}
          {(analysis.risk_reasons || []).length > 0 && (
            <Card className="p-5">
              <h3 className="mb-3 text-sm font-extrabold uppercase tracking-widest text-text-muted">Why this risk?</h3>
              <ul className="space-y-2">
                {(analysis.risk_reasons || []).map((r, i) => (
                  <li key={i} className="flex items-center gap-2 rounded-lg bg-bg-alt px-3 py-2">
                    <span className={cn('inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-extrabold', SEVERITY_CLS[r.severity] || SEVERITY_CLS.low)}>
                      {String(r.severity).toUpperCase()}
                    </span>
                    <span className="text-sm">{r.label}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {/* Parsing confidence */}
          <Card className="p-5">
            <h3 className="mb-3 text-sm font-extrabold uppercase tracking-widest text-text-muted">Parsing confidence</h3>
            <div className="grid gap-3 md:grid-cols-2">
              <Stat label="Accuracy" value={String(analysis.parse_confidence || 'medium').toUpperCase()} tone={analysis.parse_confidence === 'high' ? 'good' : analysis.parse_confidence === 'low' ? 'bad' : 'mid'} />
              <Stat label="Source" value={analysis.parse_source === 'parsed' ? 'PDF parsed' : 'Deterministic'} />
              <Stat label="Rows extracted" value={String(analysis.rows_extracted || 0)} />
              <Stat label="Bounce matches" value={String(analysis.bounce_matches_found || 0)} tone={(analysis.bounce_matches_found || 0) > 0 ? 'bad' : 'good'} />
              <Stat label="Missing pages" value={analysis.fraud_checks?.missing_pages_detected ? 'Detected' : 'None'} tone={analysis.fraud_checks?.missing_pages_detected ? 'bad' : 'good'} />
              <Stat label="OCR accuracy" value={`${analysis.fraud_checks?.ocr_confidence_pct ?? 99}%`} />
            </div>
            {analysis.manual_review_recommended && (
              <div className="mt-4 flex items-center gap-2 rounded-xl border border-warning/40 bg-warning-soft px-3 py-2 text-sm font-bold text-warning">
                <AlertTriangle size={16} /> Manual review recommended
              </div>
            )}
          </Card>

          {/* Top metrics */}
          <Card className="p-5">
            <h3 className="mb-3 text-sm font-extrabold uppercase tracking-widest text-text-muted">Monthly activity</h3>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat label="Total credit" value={moneyShort(analysis.total_credit)} tone="good" />
              <Stat label="Total debit"  value={moneyShort(analysis.total_debit)}  tone="bad" />
              <Stat label="Avg balance"  value={moneyShort(analysis.avg_balance)} />
              <Stat label="Bounces"      value={String(analysis.bounced_transactions)} tone={analysis.bounced_transactions > 0 ? 'bad' : 'good'} />
            </div>
          </Card>

          {/* AI lending decision */}
          {analysis.recommended_decision && (
            <div className={cn('flex items-center gap-3 rounded-2xl border-2 p-5',
              analysis.recommended_decision === 'approve' ? 'border-success/40 bg-success/5'
              : analysis.recommended_decision === 'approve_with_caution' ? 'border-warning/40 bg-warning-soft'
              : 'border-risk-highBorder bg-risk-highSoft')}>
              {analysis.recommended_decision === 'approve' && <CheckCircle2 size={28} className="text-success" />}
              {analysis.recommended_decision === 'approve_with_caution' && <AlertTriangle size={28} className="text-warning" />}
              {analysis.recommended_decision === 'reject' && <XCircle size={28} className="text-risk-high" />}
              <div>
                <div className="text-[10px] font-extrabold uppercase tracking-widest opacity-70">AI LENDING DECISION</div>
                <div className="text-lg font-extrabold">{analysis.recommended_decision.replace(/_/g, ' ').toUpperCase()}</div>
                {!!analysis.suggested_loan_amount && analysis.suggested_loan_amount > 0 && (
                  <div className="text-xs text-text-secondary">
                    Suggested {money(analysis.suggested_loan_amount)} · EMI {money(analysis.suggested_emi || 0)} · Capacity {analysis.repayment_capacity_pct || 0}%
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Red flags */}
          {(analysis.red_flags || []).length > 0 && (
            <Card className="p-5">
              <h3 className="mb-3 text-sm font-extrabold uppercase tracking-widest text-text-muted">Red flags</h3>
              <ul className="space-y-2">
                {(analysis.red_flags || []).map((f, i) => (
                  <li key={i} className="flex gap-2 rounded-lg bg-bg-alt px-3 py-2">
                    <span className={cn('inline-flex h-fit items-center rounded-md px-2 py-0.5 text-[10px] font-extrabold', SEVERITY_CLS[f.severity] || SEVERITY_CLS.low)}>
                      {String(f.severity).toUpperCase()}
                    </span>
                    <div>
                      <div className="text-sm font-bold">{f.title}</div>
                      <div className="text-xs text-text-muted">{f.detail}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {/* Highlights */}
          {(analysis.highlights || []).length > 0 && (
            <Card className="p-5">
              <h3 className="mb-3 text-sm font-extrabold uppercase tracking-widest text-text-muted">Highlights</h3>
              <ul className="space-y-1.5">
                {analysis.highlights!.map((h, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <CheckCircle2 size={14} className="mt-1 shrink-0 text-primary" /> <span>{h}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="secondary" onClick={downloadPdf}><Download size={16} /> Download PDF report</Button>
            <Button onClick={() => setStep('cibil')} className="flex-1"><Shield size={16} /> Check CIBIL</Button>
            <Button variant="secondary" onClick={() => setStep('summary')}>Skip CIBIL</Button>
          </div>
        </div>
      )}

      {/* === STEP 5 — CIBIL === */}
      {step === 'cibil' && (
        <Card className="space-y-5 p-6">
          <div>
            <h1 className="text-2xl font-extrabold">CIBIL enquiry</h1>
            <p className="text-sm text-text-secondary">Fetch credit bureau report using the client&apos;s PAN.</p>
          </div>
          <div className="rounded-2xl bg-gradient-to-br from-primary to-primary-dark p-6 text-center text-white">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-white/20">
              <Shield size={28} />
            </div>
            <div className="mt-3 text-xl font-extrabold">Live credit score</div>
            <div className="text-sm opacity-90">We&apos;ll pull a fresh CIBIL report against {client.pan || 'their PAN'}.</div>
          </div>
          <Button onClick={runCibil} loading={loadingCibil} className="w-full">Run CIBIL check</Button>
          <Button variant="secondary" onClick={() => setStep('analysis')} className="w-full">Back</Button>
        </Card>
      )}

      {/* === STEP 6 — SUMMARY === */}
      {step === 'summary' && (
        <div className="space-y-4">
          <div>
            <h1 className="text-2xl font-extrabold">Application summary</h1>
            <p className="text-sm text-text-secondary">Review risk and confirm to create the loan.</p>
          </div>

          <Card className="p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-white font-black">{initials(client.name)}</div>
              <div>
                <div className="font-extrabold">{client.name}</div>
                <div className="text-xs text-text-secondary">+91 {client.mobile} {client.pan ? `· ${client.pan}` : ''}</div>
              </div>
            </div>
          </Card>

          {analysis && (
            <div className={cn('flex items-center gap-3 rounded-2xl border-2 p-5', RISK_COLOR_CLS[analysis.risk_color] || RISK_COLOR_CLS.yellow)}>
              <div className="h-12 w-2 shrink-0 rounded-full bg-current" />
              <div className="flex-1">
                <div className="text-[10px] font-extrabold uppercase tracking-widest opacity-70">BANK STATEMENT</div>
                <div className="text-lg font-extrabold">{String(analysis.bounce_risk).toUpperCase()} RISK</div>
                <div className="text-xs">{analysis.bounced_transactions} bounces · Avg {moneyShort(analysis.avg_balance)}</div>
              </div>
              <button onClick={downloadPdf} className="rounded-lg bg-current/10 p-2"><Download size={16} className="text-current" /></button>
            </div>
          )}

          {cibil && (
            <div className={cn('flex items-center gap-3 rounded-2xl border-2 p-5', RISK_COLOR_CLS[cibil.band_color] || RISK_COLOR_CLS.blue)}>
              <div className="h-12 w-2 shrink-0 rounded-full bg-current" />
              <div className="flex-1">
                <div className="text-[10px] font-extrabold uppercase tracking-widest opacity-70">CIBIL SCORE</div>
                <div className="text-lg font-extrabold">{cibil.score} · {cibil.band.toUpperCase()}</div>
                <div className="text-xs">On-time {cibil.on_time_payments_pct}% · Utilization {cibil.credit_utilization_pct}%</div>
              </div>
            </div>
          )}

          {/* Overall risk roll-up */}
          <Card className="p-5">
            <h3 className="mb-2 text-sm font-extrabold uppercase tracking-widest text-text-muted">Overall client risk</h3>
            <OverallRisk analysis={analysis} cibil={cibil} />
          </Card>

          <div className="grid gap-3 sm:grid-cols-2">
            <Button
              onClick={() => setRejectOpen(true)}
              className="!border-risk-highBorder !bg-risk-highSoft !text-risk-high hover:!bg-risk-high hover:!text-white"
              variant="secondary"
            >
              <XCircle size={16} /> Reject
            </Button>
            <Button
              onClick={goApprove}
              className="!bg-success hover:!bg-success/90 text-white"
            >
              <CheckCircle2 size={16} /> Approve & continue
            </Button>
          </div>
        </div>
      )}

      {/* === Risk-warning modal (P0) — appears for overdue/at-risk clients === */}
      {riskWarnOpen && risk && (
        <RiskWarnModal
          risk={risk}
          name={client.name}
          onAck={() => { setRiskAcknowledged(true); setRiskWarnOpen(false); }}
          onCancel={() => router.replace(`/customers/${clientId}`)}
        />
      )}

      {/* === Reject modal === */}
      {rejectOpen && (
        <Modal title={`Reject ${client.name.split(' ')[0]}?`} onClose={() => setRejectOpen(false)}>
          <p className="text-sm text-text-secondary">Why are you rejecting this client?</p>
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={4}
            placeholder="e.g. High bounce risk, low CIBIL, unstable income"
            className="mt-3 w-full rounded-xl border-2 border-border bg-bg p-3 text-sm focus:border-primary focus:outline-none"
          />
          <div className="mt-4 flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={() => setRejectOpen(false)}>Cancel</Button>
            <Button
              className="flex-1 !bg-risk-high hover:!bg-risk-high/90 text-white"
              loading={rejecting}
              onClick={submitReject}
            >
              Confirm rejection
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ---------- Sub-components ----------

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] font-extrabold uppercase tracking-widest text-text-muted">{children}</div>;
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'bad' | 'mid' }) {
  const cls = tone === 'good' ? 'text-success'
    : tone === 'bad' ? 'text-risk-high'
    : tone === 'mid' ? 'text-warning'
    : 'text-text-primary';
  return (
    <div className="rounded-xl bg-bg-alt p-3">
      <div className="text-[10px] font-extrabold uppercase tracking-widest text-text-muted">{label}</div>
      <div className={cn('mt-1 text-lg font-extrabold', cls)}>{value}</div>
    </div>
  );
}

function Kv({ Icon, label, value, sub }: { Icon: typeof IdCard; label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-start gap-3 border-t border-border-light py-3 first:border-t-0 first:pt-0">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
        <Icon size={16} className="text-primary" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-extrabold uppercase tracking-widest text-text-muted">{label}</div>
        <div className="text-sm font-bold">{value}</div>
        {sub && <div className="mt-0.5 text-xs text-text-secondary">{sub}</div>}
      </div>
    </div>
  );
}

function OverallRisk({ analysis, cibil }: { analysis: Analysis | null; cibil: Cibil | null }) {
  const score = useMemo(() => {
    let weight = 0; let count = 0;
    if (analysis) {
      const m: Record<string, number> = { low: 1, medium: 2, high: 3 };
      weight += m[analysis.bounce_risk] || 2;
      count += 1;
    }
    if (cibil) {
      const m: Record<string, number> = { excellent: 1, good: 1, fair: 2, poor: 3 };
      weight += m[cibil.band] || 2;
      count += 1;
    }
    return count ? weight / count : 2;
  }, [analysis, cibil]);
  const tone = score <= 1.4 ? 'good' : score >= 2.4 ? 'bad' : 'mid';
  const label = tone === 'good' ? 'LOW' : tone === 'bad' ? 'HIGH' : 'MEDIUM';
  return (
    <div className="flex items-center gap-3">
      <div className={cn(
        'flex h-12 w-12 items-center justify-center rounded-full text-lg font-extrabold',
        tone === 'good' ? 'bg-success/10 text-success'
          : tone === 'bad' ? 'bg-risk-highSoft text-risk-high'
          : 'bg-warning/10 text-warning',
      )}>
        {tone === 'good' ? <ShieldCheck size={20} /> : tone === 'bad' ? <AlertCircle size={20} /> : <AlertTriangle size={20} />}
      </div>
      <div>
        <div className="text-[10px] font-extrabold uppercase tracking-widest text-text-muted">Composite</div>
        <div className={cn('text-lg font-extrabold',
          tone === 'good' ? 'text-success' : tone === 'bad' ? 'text-risk-high' : 'text-warning')}>{label} RISK</div>
        <div className="text-xs text-text-muted">Statement {analysis ? '✓' : '—'} · CIBIL {cibil ? '✓' : '—'}</div>
      </div>
    </div>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <Card className="w-full max-w-md p-6">
        <div className="mb-3 flex items-start justify-between">
          <h3 className="text-lg font-extrabold">{title}</h3>
          <button onClick={onClose} className="rounded-full p-1 text-text-muted hover:bg-bg-alt">
            <X size={18} />
          </button>
        </div>
        {children}
      </Card>
    </div>
  );
}

function RiskWarnModal({ risk, name, onAck, onCancel }: {
  risk: RiskSummary;
  name: string;
  onAck: () => void;
  onCancel: () => void;
}) {
  const isHigh = risk.kind === 'overdue_high';
  const tone = isHigh ? 'risk-high' : 'risk-mild';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <Card className="w-full max-w-lg p-0 overflow-hidden">
        <div className={cn('flex items-center gap-3 px-6 py-4',
          isHigh ? 'bg-risk-highSoft text-risk-high' : 'bg-risk-mildSoft text-risk-mild')}>
          {isHigh ? <AlertCircle size={24} /> : <AlertTriangle size={24} />}
          <div className="text-lg font-extrabold">
            {isHigh ? `${name} is AT RISK` : `${name} has overdue EMIs`}
          </div>
        </div>
        <div className="space-y-3 px-6 py-5">
          <div className="grid grid-cols-2 gap-3">
            <KvBox label="Active loans" value={String(risk.active_loan_count)} />
            <KvBox label="Overdue EMIs" value={String(risk.overdue_count)} />
            <KvBox label="Overdue amount" value={moneyShort(risk.overdue_amount)} />
            <KvBox label="Late payments (history)" value={String(risk.late_payments)} />
          </div>
          {risk.missed_months.length > 0 && (
            <div>
              <div className="mb-1 text-[10px] font-extrabold uppercase tracking-widest text-text-muted">Months missed</div>
              <div className="flex flex-wrap gap-1.5">
                {risk.missed_months.map((m) => (
                  <span key={m} className={cn('rounded-full px-2 py-0.5 text-[11px] font-extrabold ring-1',
                    isHigh ? 'bg-risk-highSoft text-risk-high ring-risk-highBorder'
                      : 'bg-risk-mildSoft text-risk-mild ring-risk-mildBorder',
                  )}>{m}</span>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="flex gap-3 border-t border-border-light p-4">
          <Button variant="secondary" className="flex-1" onClick={onCancel}>Back to customer</Button>
          <Button
            className={cn('flex-1', isHigh ? '!bg-risk-high hover:!bg-risk-high/90 text-white' : '!bg-risk-mild hover:!bg-risk-mild/90 text-white')}
            onClick={onAck}
          >
            I understand the risk, continue
          </Button>
        </div>
      </Card>
    </div>
  );
}

function KvBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-bg-alt p-3">
      <div className="text-[10px] font-extrabold uppercase tracking-widest text-text-muted">{label}</div>
      <div className="mt-1 text-lg font-extrabold">{value}</div>
    </div>
  );
}
