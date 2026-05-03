'use client';

import React from 'react';
import type { LoanBadge } from '@/lib/loanStatus';
import { cn } from '@/lib/utils';

export function StatusBadge({ badge, className }: { badge: LoanBadge; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold tracking-wide',
        badge.chipClasses,
        className
      )}
    >
      <span
        aria-hidden
        className={cn('h-1.5 w-1.5 rounded-full', {
          'bg-success': badge.kind === 'on_track',
          'bg-risk-mild': badge.kind === 'overdue_mild',
          'bg-risk-high': badge.kind === 'overdue_high' || badge.kind === 'defaulted',
          'bg-primary': badge.kind === 'completed',
        })}
      />
      {badge.label}
    </span>
  );
}
