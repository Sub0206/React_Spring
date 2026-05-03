'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/providers/AuthProvider';
import { Sidebar } from '@/components/Sidebar';
import { Topbar } from '@/components/Topbar';

/**
 * Authenticated shell — fixed sidebar + scrolling main area.
 *
 *   | Sidebar (240px, fixed) | Topbar (full width minus sidebar)  |
 *   |                        | Main content (24px padding, scroll)|
 *
 * The sidebar is `fixed` in Sidebar.tsx, so we add left-margin on the
 * content pane so the content never slides underneath. Content padding
 * is 24 px (p-6) to match the spec.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace('/login');
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <div className="flex h-screen items-center justify-center bg-bg">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg text-text-primary">
      <Sidebar />
      {/*
        Content wrapper. On lg+ screens we push content right by the sidebar's
        width (240 px) so the fixed sidebar doesn't overlap it. Below lg we
        simply take the full viewport (sidebar is `hidden` there).
      */}
      <div className="flex min-h-screen flex-col lg:pl-60">
        <Topbar />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
