'use client';
import { useTheme } from '@/providers/ThemeProvider';
import { Card } from '@/components/ui/Card';
import { Moon, Sun, Laptop } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function SettingsPage() {
  const { mode, setMode } = useTheme();
  const opts = [
    { key: 'system' as const, label: 'Match system', Icon: Laptop, desc: 'Follows your OS appearance' },
    { key: 'light' as const,  label: 'Light',        Icon: Sun,    desc: 'Classic royal blue — great in sunlight' },
    { key: 'dark' as const,   label: 'Dark',         Icon: Moon,   desc: 'Executive dark navy — easy on the eyes' },
  ];
  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Settings</h1>
        <p className="text-sm text-text-secondary">Personalize the console</p>
      </div>

      <Card className="p-5">
        <div className="text-xs font-bold uppercase tracking-widest text-text-muted">Appearance</div>
        <div className="text-lg font-bold">Theme</div>
        <div className="mt-4 space-y-2">
          {opts.map((o) => (
            <button
              key={o.key}
              onClick={() => setMode(o.key)}
              className={cn(
                'flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors',
                mode === o.key
                  ? 'border-primary bg-primary/5'
                  : 'border-border-light bg-bg hover:bg-surface-alt'
              )}
            >
              <div className={cn(
                'flex h-10 w-10 items-center justify-center rounded-xl',
                mode === o.key ? 'bg-primary/10 text-primary' : 'bg-bg-alt text-text-secondary'
              )}>
                <o.Icon size={18} />
              </div>
              <div className="flex-1">
                <div className="text-sm font-bold">{o.label}</div>
                <div className="text-xs text-text-muted">{o.desc}</div>
              </div>
              <div className={cn(
                'h-5 w-5 rounded-full border-2',
                mode === o.key ? 'border-primary bg-primary' : 'border-border'
              )} />
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}
