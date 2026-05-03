import { Suspense } from 'react';
import LoginInner from './LoginInner';

export default function LoginPage() {
  return (
    <Suspense fallback={<Fallback />}>
      <LoginInner />
    </Suspense>
  );
}

function Fallback() {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-bg">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
}
