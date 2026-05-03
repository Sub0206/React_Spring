import { Suspense } from 'react';
import NewLoanInner from './NewLoanInner';

export default function NewLoanPage() {
  return (
    <Suspense fallback={<Fallback />}>
      <NewLoanInner />
    </Suspense>
  );
}

function Fallback() {
  return (
    <div className="flex h-60 items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
}
