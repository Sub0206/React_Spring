'use client';

import React from 'react';
import { cn } from '@/lib/utils';

export function Card({
  children,
  className,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-border bg-surface shadow-sm',
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
