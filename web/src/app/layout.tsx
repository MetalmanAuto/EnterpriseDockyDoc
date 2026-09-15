import type { Metadata, Viewport } from 'next';
import { Manrope, JetBrains_Mono } from 'next/font/google';
import { ClerkProvider } from '@clerk/nextjs';
import './globals.css';

const manrope = Manrope({
  subsets: ['latin'],
  weight: ['500', '600', '700', '800'],
  variable: '--font-sans',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'DockyDoc',
    template: '%s | DockyDoc',
  },
  description: 'Know what expires before it does — document expiry tracking with email and SMS reminders.',
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f8fafc' },
    { media: '(prefers-color-scheme: dark)', color: '#0b1220' },
  ],
};

const clerkPublishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

/** Inline script — runs before first paint to prevent flash of wrong theme. */
const themeScript = `
try {
  var t = localStorage.getItem('dd-theme');
  if (!t) t = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  if (t === 'dark') document.documentElement.classList.add('dark');
} catch(e) {}
`;

/**
 * Clerk UI follows the app's tokens. Colours are CSS variables so the
 * sign-in card flips with the theme toggle without a second appearance object.
 */
const clerkAppearance = {
  variables: {
    colorPrimary: '#0d9488',
    colorText: 'var(--text-primary)',
    colorTextSecondary: 'var(--text-secondary)',
    colorBackground: 'var(--bg-surface)',
    colorInputBackground: 'var(--bg-surface)',
    colorInputText: 'var(--text-primary)',
    colorNeutral: 'var(--text-primary)',
    colorDanger: '#dc2626',
    borderRadius: '0.625rem',
    fontFamily: 'var(--font-sans), ui-sans-serif, system-ui, sans-serif',
    fontSize: '0.875rem',
  },
  elements: {
    card: 'shadow-none border border-stroke bg-surface',
    cardBox: 'shadow-none',
    headerTitle: 'text-ink font-extrabold tracking-[-0.02em]',
    headerSubtitle: 'text-ink-2',
    formFieldLabel: 'text-ink-2 font-semibold',
    formFieldInput: 'bg-surface border-stroke text-ink',
    formButtonPrimary: 'bg-slate-900 hover:bg-slate-800 dark:bg-brand-400 dark:hover:bg-brand-300 dark:text-slate-900 text-white font-bold normal-case shadow-none',
    footer: 'bg-surface-high',
    footerActionText: 'text-ink-2',
    footerActionLink: 'text-brand-600 dark:text-brand-300 font-semibold',
    dividerLine: 'bg-stroke',
    dividerText: 'text-ink-3',
    otpCodeFieldInput: 'bg-surface border-stroke text-ink font-mono',
    identityPreviewText: 'text-ink',
    identityPreviewEditButton: 'text-brand-600 dark:text-brand-300',
    formResendCodeLink: 'text-brand-600 dark:text-brand-300',
    alternativeMethodsBlockButton: 'border-stroke text-ink hover:bg-surface-high',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const html = (
    <html lang="en" className={`${manrope.variable} ${jetbrainsMono.variable}`} suppressHydrationWarning>
      {/* suppressHydrationWarning needed because theme script mutates className before hydration */}
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="font-sans">{children}</body>
    </html>
  );

  if (clerkPublishableKey) {
    return <ClerkProvider appearance={clerkAppearance}>{html}</ClerkProvider>;
  }

  return html;
}
