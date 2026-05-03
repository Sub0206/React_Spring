'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Trophy,
  TrendingUp,
  Wallet,
  Users,
  FileText,
  ArrowRight,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { api } from '@/lib/api';
import { cn, inr, formatDate, initials } from '@/lib/utils';

type PortfolioHealth = {
  on_track: number;
  overdue_mild?: number;
  overdue_high?: number;
  overdue?: number;
  at_risk: number;
  completed: number;
  defaulted: number;
};

type DashboardResp = {
  active_loans: number;
  total_funded: number;
  current_month_disbursed?: number;
  current_month_repaid?: number;
  overdue_count: number;
  overdue_amount: number;
  portfolio_health: PortfolioHealth;
};

type Txn = {
  tx_id: string;
  type: string;
  amount: number;
  status: string;
  client_name?: string;
  created_at: string;
};

export default function DashboardPage() {
  const router = useRouter();
  const [stats, setStats] = useState<DashboardResp | null>(null);
  const [txns, setTxns] = useState<Txn[]>([]);
  const [customers, setCustomers] = useState<number>(0);
  const [pendingApps, setPendingApps] = useState<number>(0);

  useEffect(() => {
    (async () => {
      try {
        const [d, tx, cust, apps] = await Promise.all([
          api<DashboardResp>('/dashboard'),
          api<Txn[]>('/transactions').catch(() => [] as Txn[]),
          api<any[]>('/borrowers').catch(() => [] as any[]),
          api<any[]>('/applications', { params: { status: 'pending' } }).catch(() => [] as any[]),
        ]);
        setStats(d);
        setTxns(tx || []);
        setCustomers((cust || []).length);
        setPendingApps((apps || []).length);
      } catch {}
    })();
  }, []);

  if (!stats) {
    return (
      <div className="flex h-60 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const ph = stats.portfolio_health || ({} as PortfolioHealth);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Dashboard</h1>
          <p className="text-sm text-text-secondary">Real-time portfolio snapshot</p>
        </div>
      </div>

      {/* Top KPI cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Kpi
          title="Total Funded"
          value={inr(stats.total_funded)}
          icon={<Wallet size={18} className="text-primary" />}
          accent="primary"
        />
        <Kpi
          title="Active Loans"
          value={String(stats.active_loans)}
          icon={<TrendingUp size={18} className="text-success" />}
          accent="success"
        />
        <Kpi
          title="Overdue"
          value={`${stats.overdue_count} · ${inr(stats.overdue_amount)}`}
          icon={<AlertTriangle size={18} className="text-risk-high" />}
          accent="danger"
        />
        <Kpi
          title="Monthly volume"
          value={inr((stats.current_month_disbursed || 0) + (stats.current_month_repaid || 0))}
          icon={<FileText size={18} className="text-warning" />}
          accent="warning"
        />
      </div>

      {/* Portfolio health tiles */}
      <Card className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="text-xs font-bold uppercase tracking-widest text-text-muted">
              Portfolio Health
            </div>
            <div className="text-lg font-bold">Risk-segmented book</div>
          </div>
          <button
            onClick={() => router.push('/loans')}
            className="flex items-center gap-1 text-sm font-bold text-primary hover:underline"
          >
            View all loans <ArrowRight size={14} />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <HealthTile
            onClick={() => router.push('/loans?filter=on_track')}
            icon={<CheckCircle2 size={18} />}
            color="success"
            label="On Track"
            count={ph.on_track}
          />
          <HealthTile
            onClick={() => router.push('/loans?filter=overdue_mild')}
            icon={<AlertCircle size={18} />}
            color="mild"
            label="Overdue"
            count={ph.overdue_mild ?? 0}
          />
          <HealthTile
            onClick={() => router.push('/loans?filter=overdue_high')}
            icon={<AlertTriangle size={18} />}
            color="high"
            label="At Risk"
            count={ph.overdue_high ?? 0}
          />
          <HealthTile
            onClick={() => router.push('/loans?filter=completed')}
            icon={<Trophy size={18} />}
            color="primary"
            label="Completed"
            count={ph.completed}
          />
        </div>
      </Card>

      {/* Two-column row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3 p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-bold uppercase tracking-widest text-text-muted">
                Recent transactions
              </div>
              <div className="text-lg font-bold">Last 30 days</div>
            </div>
          </div>
          <div className="mt-4 divide-y divide-border-light">
            {(txns || []).slice(0, 7).map((t) => (
              <div key={t.tx_id} className="flex items-center gap-3 py-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                  {initials(t.client_name)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{t.client_name || 'Platform'}</div>
                  <div className="text-xs text-text-muted">
                    {t.type} · {formatDate(t.created_at)}
                  </div>
                </div>
                <div
                  className={cn(
                    'text-sm font-extrabold',
                    t.type === 'disbursement' ? 'text-risk-high' : 'text-success'
                  )}
                >
                  {t.type === 'disbursement' ? '-' : '+'}
                  {inr(t.amount)}
                </div>
              </div>
            ))}
            {!txns.length && (
              <div className="py-8 text-center text-sm text-text-muted">No recent transactions</div>
            )}
          </div>
        </Card>

        <Card className="lg:col-span-2 p-5">
          <div className="text-xs font-bold uppercase tracking-widest text-text-muted">Book</div>
          <div className="text-lg font-bold">At a glance</div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <MiniStat icon={<Users size={16} />} label="Customers" value={String(customers)} />
            <MiniStat icon={<FileText size={16} />} label="Pending Apps" value={String(pendingApps)} />
            <MiniStat icon={<TrendingUp size={16} />} label="Active" value={String(stats.active_loans)} />
            <MiniStat icon={<AlertTriangle size={16} />} label="At Risk" value={String(ph.overdue_high ?? 0)} tone="high" />
          </div>
          <button
            onClick={() => router.push('/applications')}
            className="mt-5 w-full rounded-xl bg-primary/10 px-4 py-3 text-sm font-bold text-primary hover:bg-primary/20"
          >
            Review pending applications
          </button>
        </Card>
      </div>
    </div>
  );
}

function Kpi({
  title,
  value,
  icon,
  accent,
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
  accent: 'primary' | 'success' | 'warning' | 'danger';
}) {
  const ring: Record<string, string> = {
    primary: 'ring-primary/30',
    success: 'ring-success/30',
    warning: 'ring-warning/30',
    danger: 'ring-risk-highBorder',
  };
  const iconBg: Record<string, string> = {
    primary: 'bg-primary/10',
    success: 'bg-success/10',
    warning: 'bg-warning/10',
    danger: 'bg-risk-highSoft',
  };
  return (
    <Card className={cn('p-5 ring-1', ring[accent])}>
      <div className="flex items-center justify-between">
        <div className="text-xs font-bold uppercase tracking-widest text-text-muted">{title}</div>
        <div className={cn('flex h-9 w-9 items-center justify-center rounded-xl', iconBg[accent])}>
          {icon}
        </div>
      </div>
      <div className="mt-3 text-2xl font-extrabold tracking-tight">{value}</div>
    </Card>
  );
}

function HealthTile({
  icon,
  color,
  label,
  count,
  onClick,
}: {
  icon: React.ReactNode;
  color: 'success' | 'mild' | 'high' | 'primary';
  label: string;
  count: number;
  onClick: () => void;
}) {
  const cls: Record<string, string> = {
    success: 'border-success/30 bg-success/5 text-success',
    mild: 'border-risk-mildBorder bg-risk-mildSoft text-risk-mild',
    high: 'border-risk-highBorder bg-risk-highSoft text-risk-high',
    primary: 'border-primary/30 bg-primary/5 text-primary',
  };
  return (
    <button
      onClick={onClick}
      className={cn(
        'rounded-xl border p-4 text-left transition-colors hover:brightness-110',
        cls[color]
      )}
    >
      <div className="flex items-center justify-between">
        <div>{icon}</div>
        <div className="text-2xl font-extrabold leading-none">{count}</div>
      </div>
      <div className="mt-2 text-xs font-bold uppercase tracking-wider">{label}</div>
    </button>
  );
}

function MiniStat({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: 'default' | 'high';
}) {
  return (
    <div
      className={cn(
        'rounded-xl border border-border-light bg-bg-alt p-3',
        tone === 'high' && 'border-risk-highBorder bg-risk-highSoft text-risk-high'
      )}
    >
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-text-muted">
        <span className={cn(tone === 'high' ? 'text-risk-high' : 'text-text-secondary')}>{icon}</span>
        {label}
      </div>
      <div className="mt-1 text-xl font-extrabold">{value}</div>
    </div>
  );
}
