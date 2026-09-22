import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Brand accent — teal. Every existing `brand-*` utility picks this up.
        brand: {
          50:  '#f0fdfa',
          100: '#ccfbf1',
          200: '#99f6e4',
          300: '#5eead4',
          400: '#2dd4bf',
          500: '#14b8a6',
          600: '#0d9488',
          700: '#0f766e',
          800: '#115e59',
          900: '#134e4a',
        },
        // CSS-variable-backed semantic tokens — auto-switch in dark mode
        // Usage: bg-canvas, bg-surface, text-ink, border-stroke, etc.
        canvas:         'var(--bg-canvas)',
        surface:        'var(--bg-surface)',
        'surface-high': 'var(--bg-surface-raised)',
        ink:            'var(--text-primary)',
        'ink-2':        'var(--text-secondary)',
        'ink-3':        'var(--text-tertiary)',
        stroke:         'var(--border-default)',
        'stroke-soft':  'var(--border-muted)',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        // Marketing headlines only (Archivo, loaded in the marketing layout).
        display: ['var(--font-display)', 'var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      letterSpacing: {
        label: '0.06em',
      },
      boxShadow: {
        card:       '0 1px 3px rgba(2,6,23,0.07), 0 1px 2px -1px rgba(2,6,23,0.05)',
        'card-md':  '0 4px 12px -1px rgba(2,6,23,0.12), 0 2px 6px -2px rgba(2,6,23,0.08)',
        'card-lg':  '0 12px 32px -4px rgba(2,6,23,0.18), 0 4px 10px -4px rgba(2,6,23,0.1)',
        'card-glow':'0 0 0 1px rgba(45,212,191,0.25), 0 4px 20px rgba(45,212,191,0.10)',
        'inner-sm': 'inset 0 1px 2px rgba(2,6,23,0.06)',
      },
      keyframes: {
        'radar-sweep': { from: { transform: 'rotate(0deg)' }, to: { transform: 'rotate(360deg)' } },
        'radar-blip':  { '0%,100%': { transform: 'scale(1)', opacity: '0.9' }, '50%': { transform: 'scale(1.5)', opacity: '0.3' } },
        'radar-tilt':  {
          '0%,100%': { transform: 'rotateX(28deg) rotateY(-18deg) rotateZ(6deg) translateY(0)' },
          '50%':     { transform: 'rotateX(26deg) rotateY(-14deg) rotateZ(5deg) translateY(-10px)' },
        },
        'rise': { from: { opacity: '0', transform: 'translateY(12px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
      },
      animation: {
        'radar-sweep': 'radar-sweep 5s linear infinite',
        'radar-blip':  'radar-blip 2.4s ease-in-out infinite',
        'radar-tilt':  'radar-tilt 9s ease-in-out infinite',
        'rise':        'rise .6s cubic-bezier(.16,1,.3,1) both',
      },
    },
  },
  plugins: [],
};

export default config;
