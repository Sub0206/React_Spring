'use client';

import { useTheme } from '@/providers/ThemeProvider';
import { useAuth } from '@/providers/AuthProvider';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Laptop, LogOut, Moon, ShieldCheck, Sun, User } from 'lucide-react';
import { cn, initials } from '@/lib/utils';

/**
 * Settings page — 1:1 mirror of the mobile Profile tab:
 *   • Avatar + Name + Mobile + "Verified Lender" chip
 *   • Appearance card (Light / System / Dark)
 *   • Logout button
 *
 * No Applications menu, no subscription CTA (not in scope), no placeholders.
 */
export default function SettingsPage() {
  const { mode, setMode } = useTheme();
  const { user, logout } = useAuth();

  const themes = [
    { key: 'system' as const, label: 'Match system', Icon: Laptop, desc: 'Follows your OS appearance' },
    { key: 'light'  as const, label: 'Light',        Icon: Sun,    desc: 'Classic royal blue — great in sunlight' },
    { key: 'dark'   as const, label: 'Dark',         Icon: Moon,   desc: 'Executive dark navy — easy on the eyes' },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Settings</h1>
        <p className="text-sm text-text-secondary">Profile, theme and sign-out</p>
      </div>

      {/* Profile card — mirrors mobile Profile header */}
      <Card className="p-6">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary text-2xl font-black text-white shadow-md">
            {initials(user?.name)}
          </div>
          <div className="text-center">
            <div className="text-xl font-extrabold">{user?.name || '—'}</div>
            <div className="mt-0.5 text-sm text-text-secondary">+91 {user?.mobile}</div>
            {user?.email && (
              <div className="mt-0.5 text-sm text-text-secondary">{user.email}</div>
            )}
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-[11px] font-extrabold text-primary">
            <ShieldCheck size={12} /> Verified Lender
          </span>
        </div>
      </Card>

      {/* Theme card */}
      <Card className="p-5">
        <div className="text-xs font-bold uppercase tracking-widest text-text-muted">Appearance</div>
        <div className="text-lg font-bold">Theme</div>
        <div className="mt-4 space-y-2">
          {themes.map((o) => (
            <button
              key={o.key}
              onClick={() => setMode(o.key)}
              className={cn(
                'flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors',
                mode === o.key
                  ? 'border-primary bg-primary/5'
                  : 'border-border-light bg-bg hover:bg-surface-alt',
              )}
            >
              <div
                className={cn(
                  'flex h-10 w-10 items-center justify-center rounded-xl',
                  mode === o.key ? 'bg-primary/10 text-primary' : 'bg-bg-alt text-text-secondary',
                )}
              >
                <o.Icon size={18} />
              </div>
              <div className="flex-1">
                <div className="text-sm font-bold">{o.label}</div>
                <div className="text-xs text-text-muted">{o.desc}</div>
              </div>
              <div
                className={cn(
                  'h-5 w-5 rounded-full border-2',
                  mode === o.key ? 'border-primary bg-primary' : 'border-border',
                )}
              />
            </button>
          ))}
        </div>
      </Card>

      {/* Account / Logout */}
      <Card className="p-5">
        <div className="text-xs font-bold uppercase tracking-widest text-text-muted">Account</div>
        <div className="text-lg font-bold">Sign out</div>
        <p className="mt-1 text-xs text-text-secondary">
          Signing out clears your session on this browser. You&apos;ll need a fresh OTP to sign back in.
        </p>
        <Button
          onClick={logout}
          variant="secondary"
          className="mt-4 !border-risk-highBorder !bg-risk-highSoft !text-risk-high hover:!bg-risk-high hover:!text-white"
        >
          <LogOut size={16} /> Sign out
        </Button>
      </Card>
    </div>
  );
}
