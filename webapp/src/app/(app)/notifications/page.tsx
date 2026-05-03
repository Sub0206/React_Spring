'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { api } from '@/lib/api';
import { cn, formatDate } from '@/lib/utils';
import { Bell, CheckCircle2 } from 'lucide-react';

type Notification = {
  notification_id: string;
  title: string;
  body?: string;
  category?: string;
  read?: boolean;
  created_at: string;
};

export default function NotificationsPage() {
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const load = async () => {
    try { setItems(await api<Notification[]>('/notifications')); }
    catch {} finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const markAllRead = async () => {
    try {
      // best-effort per-item; backend doesn't expose a bulk endpoint yet.
      await Promise.all(items.filter((n) => !n.read).map((n) =>
        api(`/notifications/${n.notification_id}/read`, { method: 'POST' }).catch(() => null)
      ));
      await load();
    } catch {}
  };

  const filtered = filter === 'unread' ? items.filter((n) => !n.read) : items;
  const unread = items.filter((n) => !n.read).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Notifications</h1>
          <p className="text-sm text-text-secondary">
            {items.length} total · {unread} unread
          </p>
        </div>
        {unread > 0 && (
          <button
            onClick={markAllRead}
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary/10 px-3 py-2 text-xs font-bold text-primary hover:bg-primary/20"
          >
            <CheckCircle2 size={14} /> Mark all read
          </button>
        )}
      </div>

      <div className="flex gap-2">
        {(['all', 'unread'] as const).map((k) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={cn(
              'rounded-full border px-3 py-1.5 text-xs font-bold',
              filter === k ? 'border-primary bg-primary/10 text-primary' : 'border-border-light bg-bg-alt text-text-secondary'
            )}
          >
            {k === 'all' ? 'All' : 'Unread only'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="flex flex-col items-center justify-center p-12 text-center">
          <Bell size={32} className="text-text-muted" />
          <div className="mt-3 text-sm font-bold text-text-primary">All caught up</div>
          <div className="text-xs text-text-muted">Nothing new to see here.</div>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((n) => (
            <Card
              key={n.notification_id}
              className={cn(
                'flex items-start gap-3 p-4 transition-colors',
                !n.read && 'border-l-4 border-l-primary'
              )}
            >
              <div
                className={cn(
                  'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
                  !n.read ? 'bg-primary/10 text-primary' : 'bg-bg-alt text-text-muted'
                )}
              >
                <Bell size={16} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <div className="truncate text-sm font-bold">{n.title}</div>
                  {!n.read && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                </div>
                {n.body && (
                  <div className="mt-1 text-xs text-text-secondary leading-relaxed">{n.body}</div>
                )}
                <div className="mt-1 text-[11px] text-text-muted">{formatDate(n.created_at, 'long')}</div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
