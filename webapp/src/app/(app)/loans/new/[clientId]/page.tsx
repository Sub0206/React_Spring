'use client';

import { Suspense } from 'react';
import NewLoanWizardInner from './NewLoanWizardInner';

/**
 * Heavy new-loan flow — the desktop port of `/app/frontend/app/loan-new/[clientId].tsx`.
 * 6-step wizard (review → upload → analyzing → analysis → cibil → summary)
 * culminating in `/loans/new/<clientId>/approve` for the final disbursement form.
 */
export default function Page() {
  return (
    <Suspense fallback={<div className="flex h-40 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>}>
      <NewLoanWizardInner />
    </Suspense>
  );
}
