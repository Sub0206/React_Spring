'use client';

import { Suspense } from 'react';
import CustomerDetailInner from './CustomerDetailInner';

/**
 * Customer detail route: /customers/[id]
 * Shows KYC details, risk summary and ALL loans for the client.
 */
export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="flex h-40 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      }
    >
      <CustomerDetailInner />
    </Suspense>
  );
}
