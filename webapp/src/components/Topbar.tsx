'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Moon, Search, Sun, LogOut, Laptop } from 'lucide-react';
import { useTheme } from '@/providers/ThemeProvider';
import { useAuth } from '@/providers/AuthProvider';
import { NotificationBell } from './NotificationBell';
import { initials, cn } from '@/lib/utils';

/**
 * Top bar. Per product spec:
 *   • Left       : <sidebar owns the logo — nothing here>
 *   • Center     : Global search bar (flex-grow, capped at max-w-2xl)
 *   • Top-right  : Theme toggle · Notification bell · Profile (avatar + name)
 *
 * Search navigates to /customers or /loans based on the query context
 * (a numeric query routes to /loans, otherwise customers list).
 */
export function Topbar() {
  const router = useRouter();
  const { mode, setMode } = useTheme();
  const { user, logout } = useAuth();
  const [profileOpen, setProfileOpen] = useState(false);
  const [q, setQ] = useState('');

  // Close the profile popover on ESC.
  useEffect(() => {
    if (!profileOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setProfileOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [profileOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const query = q.trim();
    if (!query) return;
    if (/^[0-9]+$/.test(query)) {
      router.push(`/loans?q=${encodeURIComponent(query)}`);
    } else {
      router.push(`/customers?q=${encodeURIComponent(query)}`);
    }
  };

  const modeButtons = useMemo(
    () => ([
      { k: 'light',  Icon: Sun,    label: 'Light theme' },
      { k: 'system', Icon: Laptop, label: 'System theme' },
      { k: 'dark',   Icon: Moon,   label: 'Dark theme' },
    ] as const),
    [],
  );

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border-light bg-surface/80 px-4 backdrop-blur lg:px-6">
      {/* === CENTER : search === */}
      <form onSubmit={handleSubmit} className="relative flex-1 max-w-2xl">
        <Search
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
        />
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search customers, loans or mobile number…"
          className="h-10 w-full rounded-xl border border-border bg-bg pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </form>

      {/* === TOP-RIGHT : theme toggle + bell + profile === */}
      <div className="ml-auto flex items-center gap-3">
        <div className="hidden sm:flex items-center gap-1 rounded-xl border border-border-light bg-bg p-1">
          {modeButtons.map(({ k, Icon, label }) => (
            <button
              key={k}
              onClick={() => setMode(k)}
              title={label}
              aria-label={label}
              className={cn(
                'flex h-8 w-9 items-center justify-center rounded-lg transition-colors',
                mode === k ? 'bg-primary/10 text-primary' : 'text-text-muted hover:text-text-primary',
              )}
            >
              <Icon size={15} />
            </button>
          ))}
        </div>

        <NotificationBell />

        <div className="relative">
          <button
            onClick={() => setProfileOpen((v) => !v)}
            className="flex h-10 items-center gap-2 rounded-xl border border-border-light bg-bg px-2 hover:bg-surface-alt"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">
              {initials(user?.name)}
            </div>
            <div className="hidden text-left sm:block">
              <div className="text-xs font-bold leading-tight">{user?.name || '—'}</div>
              <div className="text-[10px] text-text-muted leading-tight">+91 {user?.mobile}</div>
            </div>
          </button>
          {profileOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setProfileOpen(false)} />
              <div className="absolute right-0 z-20 mt-2 w-56 rounded-xl border border-border bg-surface p-2 shadow-xl">
                <div className="px-3 py-2 text-xs text-text-muted">Signed in as</div>
                <div className="px-3 pb-2 text-sm font-bold">{user?.name || '—'}</div>
                <div className="border-t border-border-light my-1" />
                <button
                  onClick={() => { setProfileOpen(false); logout(); }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-risk-high hover:bg-risk-highSoft"
                >
                  <LogOut size={16} /> Sign out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
