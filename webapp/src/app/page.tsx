'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/providers/AuthProvider';

/** Root `/` page — redirects based on auth state. */
export default function Home() {
  const router = useRouter();
  const { user, loading, hasServerPasscode, sessionUnlocked } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!user) { router.replace('/login'); return; }
    if (hasServerPasscode && !sessionUnlocked) {
      router.replace('/passcode?mode=verify');
      return;
    }
    router.replace('/dashboard');
  }, [loading, user, hasServerPasscode, sessionUnlocked, router]);

  return (
    <div className="flex h-screen w-full items-center justify-center bg-bg">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
}
