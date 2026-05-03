'use client';

import React from 'react';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
type Size = 'sm' | 'md' | 'lg';

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  loading,
  className,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50';
  const variants: Record<Variant, string> = {
    primary: 'bg-primary text-white hover:bg-primary/90 shadow-sm',
    secondary:
      'bg-surface text-text-primary border border-border hover:bg-surface-alt',
    ghost: 'text-text-primary hover:bg-surface-alt',
    danger: 'bg-risk-high text-white hover:bg-risk-high/90',
    success: 'bg-success text-white hover:bg-success/90',
  };
  const sizes: Record<Size, string> = {
    sm: 'h-9 px-3 text-sm',
    md: 'h-11 px-4 text-sm',
    lg: 'h-12 px-5 text-base',
  };
  return (
    <button
      disabled={loading || rest.disabled}
      className={cn(base, variants[variant], sizes[size], className)}
      {...rest}
    >
      {loading ? <Spinner /> : children}
    </button>
  );
}

function Spinner() {
  return (
    <span
      aria-hidden
      className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/50 border-t-white"
    />
  );
}
