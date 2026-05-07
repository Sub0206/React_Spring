'use client';

import { Suspense } from 'react';
import ApproveLoanInner from './ApproveLoanInner';

export default function Page() {
  return (
    <Suspense fallback={<div className="flex h-40 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>}>
      <ApproveLoanInner />
    </Suspense>
  );
}
