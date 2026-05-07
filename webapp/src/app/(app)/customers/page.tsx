'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronRight, Search, AlertCircle, AlertTriangle, CheckCircle2, Plus } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { api } from '@/lib/api';
import { initials, cn } from '@/lib/utils';

type Client = {
  client_id: string;
  name: string;
  mobile: string;
  pan?: string;
  aadhaar_verified?: boolean;
  pan_verified?: boolean;
  risk_kind?: 'on_track' | 'overdue_mild' | 'overdue_high' | null;
  risk_overdue_count?: number | null;
  risk_overdue_amount?: number | null;
};

function riskChip(kind?: string | null) {
  if (kind === 'overdue_high')
    return { label: 'AT RISK', cls: 'bg-risk-highSoft text-risk-high ring-1 ring-risk-highBorder', Icon: AlertCircle };
  if (kind === 'overdue_mild')
    return { label: 'OVERDUE', cls: 'bg-risk-mildSoft text-risk-mild ring-1 ring-risk-mildBorder', Icon: AlertTriangle };
  return { label: 'ON TRACK', cls: 'bg-success/10 text-success ring-1 ring-success/20', Icon: CheckCircle2 };
}

export default function CustomersPage() {
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>([]);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'all' | 'on_track' | 'overdue_mild' | 'overdue_high'>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try { setClients(await api<Client[]>('/clients')); }
      catch {} finally { setLoading(false); }
    })();
  }, []);

  const filtered = useMemo(() => {
    let out = clients;
    if (filter !== 'all') out = out.filter((c) => (c.risk_kind || 'on_track') === filter);
    const query = q.trim().toLowerCase();
    if (query) {
      out = out.filter((c) =>
        c.name.toLowerCase().includes(query) ||
        (c.mobile || '').includes(query) ||
        (c.pan || '').toLowerCase().includes(query)
      );
    }
    return out;
  }, [clients, filter, q]);

  const counts = useMemo(() => ({
    all: clients.length,
    on_track: clients.filter((c) => (c.risk_kind || 'on_track') === 'on_track').length,
    overdue_mild: clients.filter((c) => c.risk_kind === 'overdue_mild').length,
    overdue_high: clients.filter((c) => c.risk_kind === 'overdue_high').length,
  }), [clients]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Customers</h1>
          <p className="text-sm text-text-secondary">{clients.length} verified clients</p>
        </div>
        <Button onClick={() => router.push('/customers/add')}>
          <Plus size={16} /> Add client
        </Button>
      </div>

      <Card className="p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="relative flex-1">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <Input
              placeholder="Search by name, mobile or PAN"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto">
            {(
              [
                { k: 'all',          label: 'All',          accent: 'text-text-primary' },
                { k: 'on_track',     label: 'On Track',     accent: 'text-success' },
                { k: 'overdue_mild', label: 'Overdue',      accent: 'text-risk-mild' },
                { k: 'overdue_high', label: 'At Risk',      accent: 'text-risk-high' },
              ] as const
            ).map((f) => {
              const active = filter === f.k;
              const n = (counts as any)[f.k];
              return (
                <button
                  key={f.k}
                  onClick={() => setFilter(f.k as any)}
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
        <Card className="p-10 text-center text-sm text-text-muted">No customers match your filter.</Card>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border-light bg-surface">
          <table className="w-full">
            <thead className="border-b border-border-light bg-bg-alt text-xs font-bold uppercase tracking-widest text-text-muted">
              <tr>
                <th className="py-3 pl-4 text-left">Customer</th>
                <th className="px-3 text-left">Mobile</th>
                <th className="px-3 text-left">Risk</th>
                <th className="px-3 text-left">Overdue</th>
                <th className="pr-4" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border-light">
              {filtered.map((c) => {
                const r = riskChip(c.risk_kind);
                return (
                  <tr
                    key={c.client_id}
                    onClick={() => router.push(`/customers/${c.client_id}`)}
                    className="cursor-pointer transition-colors hover:bg-bg-alt"
                  >
                    <td className="py-3 pl-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                          {initials(c.name)}
                        </div>
                        <div>
                          <div className="text-sm font-bold">{c.name}</div>
                          <div className="text-xs text-text-muted">{c.pan || '—'}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 text-sm">+91 {c.mobile}</td>
                    <td className="px-3">
                      <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-extrabold tracking-wide', r.cls)}>
                        <r.Icon size={12} />
                        {r.label}
                      </span>
                    </td>
                    <td className="px-3">
                      {c.risk_overdue_count ? (
                        <span className={cn('text-xs font-bold',
                          c.risk_kind === 'overdue_high' ? 'text-risk-high' : 'text-risk-mild')}>
                          {c.risk_overdue_count} · ₹{Number(c.risk_overdue_amount || 0).toLocaleString()}
                        </span>
                      ) : (
                        <span className="text-xs text-text-muted">—</span>
                      )}
                    </td>
                    <td className="pr-4">
                      <ChevronRight size={18} className="text-text-muted" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
