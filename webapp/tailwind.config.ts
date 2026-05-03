import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Sync with mobile theme.ts so both apps look identical.
        primary: { DEFAULT: 'hsl(var(--primary))', fg: 'hsl(var(--primary-fg))', soft: 'hsl(var(--primary-soft))' },
        surface: { DEFAULT: 'hsl(var(--surface))', alt: 'hsl(var(--surface-alt))' },
        border: { DEFAULT: 'hsl(var(--border))', light: 'hsl(var(--border-light))' },
        text: { primary: 'hsl(var(--text-primary))', secondary: 'hsl(var(--text-secondary))', muted: 'hsl(var(--text-muted))' },
        bg: { DEFAULT: 'hsl(var(--bg))', alt: 'hsl(var(--bg-alt))' },
        success: { DEFAULT: 'hsl(var(--success))', soft: 'hsl(var(--success-soft))' },
        warning: { DEFAULT: 'hsl(var(--warning))', soft: 'hsl(var(--warning-soft))' },
        danger: { DEFAULT: 'hsl(var(--danger))', soft: 'hsl(var(--danger-soft))' },
        risk: {
          mild: 'hsl(var(--risk-mild))',
          mildSoft: 'hsl(var(--risk-mild-soft))',
          mildBorder: 'hsl(var(--risk-mild-border))',
          high: 'hsl(var(--risk-high))',
          highSoft: 'hsl(var(--risk-high-soft))',
          highBorder: 'hsl(var(--risk-high-border))',
        },
      },
      borderRadius: { xl: '16px', '2xl': '20px', pill: '999px' },
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
    },
  },
  plugins: [],
};

export default config;
