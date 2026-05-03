'use client';

import { useState } from 'react';
import { Moon, Search, Sun, User, LogOut, Laptop } from 'lucide-react';
import { useTheme } from '@/providers/ThemeProvider';
import { useAuth } from '@/providers/AuthProvider';
import { NotificationBell } from './NotificationBell';
import { initials } from '@/lib/utils';
import { cn } from '@/lib/utils';

export function Topbar() {
  const { mode, setMode, resolved } = useTheme();
  const { user, logout } = useAuth();
  const [profileOpen, setProfileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border-light bg-surface/80 px-4 backdrop-blur lg:px-6">
      {/* search */}
      <div className="relative flex-1 max-w-xl">
        <Search
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
        />
        <input
          type="text"
          placeholder="Search customers, loans, applications…"
          className="h-10 w-full rounded-xl border border-border bg-bg pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>

      {/* theme toggle */}
      <div className="hidden sm:flex items-center gap-1 rounded-xl border border-border-light bg-bg p-1">
        {(
          [
            { k: 'light', Icon: Sun },
            { k: 'system', Icon: Laptop },
            { k: 'dark', Icon: Moon },
          ] as const
        ).map(({ k, Icon }) => (
          <button
            key={k}
            onClick={() => setMode(k)}
            aria-label={`Set ${k} theme`}
            className={cn(
              'flex h-8 w-9 items-center justify-center rounded-lg transition-colors',
              mode === k ? 'bg-primary/10 text-primary' : 'text-text-muted hover:text-text-primary'
            )}
          >
            <Icon size={15} />
          </button>
        ))}
      </div>

      <NotificationBell />

      {/* profile */}
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
              <button
                onClick={() => {
                  setProfileOpen(false);
                  logout();
                }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-risk-high hover:bg-risk-highSoft"
              >
                <LogOut size={16} /> Sign out
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  );
}
