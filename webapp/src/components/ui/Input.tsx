'use client';

import React from 'react';
import { cn } from '@/lib/utils';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          'block w-full rounded-xl border-2 border-border bg-surface px-4 py-3 text-[15px] text-text-primary placeholder:text-text-muted',
          'focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30',
          'disabled:opacity-60',
          className
        )}
        {...props}
      />
    );
  }
);
