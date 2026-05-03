'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell } from 'lucide-react';
import { api, getToken } from '@/lib/api';
import { cn } from '@/lib/utils';

type Notif = { notification_id: string; read?: boolean };

/** Notification bell with badge (9+ cap) and subtle bump animation when the
 * unread count grows. Matches mobile behaviour. */
export function NotificationBell() {
  const router = useRouter();
  const [count, setCount] = useState(0);
  const prev = useRef(0);
  const [bump, setBump] = useState(false);

  const fetchUnread = useCallback(async () => {
    if (!getToken()) return;
    try {
      const list = await api<Notif[]>('/notifications');
      const unread = (list || []).filter((n) => !n.read).length;
      setCount((c) => {
        prev.current = c;
        return unread;
      });
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    fetchUnread();
    const t = setInterval(fetchUnread, 30_000);
    const onVis = () => document.visibilityState === 'visible' && fetchUnread();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [fetchUnread]);

  useEffect(() => {
    if (count > prev.current && count > 0) {
      setBump(true);
      const id = setTimeout(() => setBump(false), 600);
      return () => clearTimeout(id);
    }
  }, [count]);

  const display = count > 9 ? '9+' : String(count);

  return (
    <button
      onClick={() => router.push('/notifications')}
      aria-label={count ? `Notifications (${count} unread)` : 'Notifications'}
      className={cn(
        'relative flex h-10 w-10 items-center justify-center rounded-xl border border-border-light bg-bg transition-transform hover:bg-surface-alt',
        bump && 'animate-bump'
      )}
    >
      <Bell size={18} className="text-text-secondary" />
      {count > 0 && (
        <span className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-risk-high px-1 py-0.5 text-center text-[10px] font-extrabold leading-tight text-white ring-2 ring-surface">
          {display}
        </span>
      )}
      <style jsx>{`
        @keyframes bump {
          0% { transform: scale(1); }
          40% { transform: scale(1.2); }
          70% { transform: scale(0.96); }
          100% { transform: scale(1); }
        }
        :global(.animate-bump) { animation: bump 520ms ease-out; }
      `}</style>
    </button>
  );
}
