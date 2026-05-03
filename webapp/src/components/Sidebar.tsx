'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  CreditCard,
  Users,
  Bell,
  Settings,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Primary navigation. Fixed width = 240 px (Tailwind w-60). The sidebar is
 * sticky so it stays in view while the <main> content scrolls. Applications
 * menu was removed in Iteration 29 per product spec (not part of scope).
 */
const ITEMS = [
  { href: '/dashboard',     label: 'Dashboard',     icon: LayoutDashboard },
  { href: '/loans',         label: 'Loans',         icon: CreditCard },
  { href: '/customers',     label: 'Customers',     icon: Users },
  { href: '/notifications', label: 'Notifications', icon: Bell },
  { href: '/settings',      label: 'Settings',      icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="hidden lg:flex fixed inset-y-0 left-0 z-30 h-screen w-60 shrink-0 flex-col border-r border-border-light bg-surface">
      {/* Logo block — "Left: Logo only" per spec */}
      <div className="flex h-16 items-center gap-2 px-5 border-b border-border-light">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-white font-black shadow-sm">
          LQ
        </div>
        <div>
          <div className="text-lg font-bold leading-none">LendIQ</div>
          <div className="text-[10px] font-semibold tracking-widest text-text-muted">
            LENDING CONSOLE
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-1">
          {ITEMS.map((item) => {
            const active =
              pathname === item.href ||
              (item.href !== '/dashboard' && pathname?.startsWith(item.href));
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors',
                    active
                      ? 'bg-primary/10 text-primary'
                      : 'text-text-secondary hover:bg-surface-alt hover:text-text-primary',
                  )}
                >
                  <Icon
                    size={18}
                    className={
                      active ? 'text-primary' : 'text-text-muted group-hover:text-text-primary'
                    }
                  />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-border-light p-4">
        <div className="text-[10px] uppercase tracking-widest text-text-muted">Powered by</div>
        <div className="text-xs font-bold text-text-secondary">SKYNOTECH</div>
      </div>
    </aside>
  );
}
