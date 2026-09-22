import Link from 'next/link';
import { Archivo } from 'next/font/google';
import Logo from '@/components/brand/Logo';
import ConsentBanner from '@/components/marketing/ConsentBanner';
import Tracking from '@/components/marketing/Tracking';

/** Headline face for the public pages only; the app keeps Manrope. */
const archivo = Archivo({
  subsets: ['latin'],
  weight: ['500', '700', '800'],
  variable: '--font-display',
  display: 'swap',
});

/**
 * Public pages: landing, pricing, security, legal. No sign-in needed and
 * no app chrome. The whole group is always dark ("the ledger"): the
 * `.marketing` scope in globals.css swaps the theme tokens and turns the
 * brand buttons amber, so every public page picks it up without edits.
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`dark marketing ${archivo.variable} min-h-screen bg-canvas text-ink flex flex-col`}>
      <header className="sticky top-0 z-40 border-b border-stroke-soft bg-canvas/95 backdrop-blur">
        <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between px-4 sm:px-6">
          <Link href="/" aria-label="DockyDoc home" className="flex items-center">
            <span className="sm:hidden"><Logo size={32} motion="hover" /></span>
            <span className="hidden sm:inline-flex"><Logo size={40} motion="hover" /></span>
          </Link>
          <nav className="hidden md:flex items-center gap-7 text-[15px] font-medium text-ink-2">
            <Link href="/#ledger" className="hover:text-ink">The ledger</Link>
            <Link href="/pricing" className="hover:text-ink">Pricing</Link>
            <Link href="/security" className="hover:text-ink">Security</Link>
            <Link href="/developers" className="hover:text-ink">API</Link>
            <Link href="/help" className="hover:text-ink">Help</Link>
          </nav>
          <div className="flex items-center gap-2 sm:gap-3">
            <Link href="/login" className="hidden sm:inline-flex h-10 px-3 items-center text-[15px] font-medium text-ink-2 hover:text-ink">Sign in</Link>
            <Link href="/register" className="h-10 px-4 sm:px-5 inline-flex items-center rounded-md bg-brand-600 text-sm font-bold">
              Start free
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-stroke-soft">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-12 grid gap-10 sm:grid-cols-3 text-sm">
          <div>
            <Logo size={44} motion="none" />
            <p className="mt-4 max-w-xs text-ink-2 leading-relaxed">
              Every licence, certificate, policy and contract on one radar, with the right person told before it lapses.
            </p>
          </div>
          <div className="space-y-2">
            <p className="font-mono text-xs uppercase tracking-[0.12em] text-ink-3">Product</p>
            <FooterLink href="/pricing">Pricing</FooterLink>
            <FooterLink href="/security">Security and data</FooterLink>
            <FooterLink href="/help">Help centre</FooterLink>
            <FooterLink href="/developers">API and developers</FooterLink>
            <FooterLink href="/register">Start free</FooterLink>
            <FooterLink href="/login">Sign in</FooterLink>
          </div>
          <div className="space-y-2">
            <p className="font-mono text-xs uppercase tracking-[0.12em] text-ink-3">Company</p>
            <FooterLink href="/terms">Terms of service</FooterLink>
            <FooterLink href="/privacy">Privacy policy</FooterLink>
            <FooterLink href="/refunds">Refunds and cancellation</FooterLink>
            <FooterLink href="/acceptable-use">Acceptable use</FooterLink>
            <p className="pt-3 text-ink-3 leading-relaxed">
              Excelleta Tech Private Limited<br />
              Flat No. 706E, 7th Floor, Sector 19B Dwarka Front, Dwarka, New Delhi 110075, India<br />
              GSTIN 07AAHCE4776H1ZC<br />
              <a href="mailto:support@dockydoc.app" className="hover:text-ink">support@dockydoc.app</a>
            </p>
          </div>
        </div>
        <p className="pb-8 text-center font-mono text-xs text-ink-3">&copy; {new Date().getFullYear()} Excelleta Tech Private Limited. DockyDoc is a product of Excelleta.</p>
      </footer>

      <ConsentBanner />
      <Tracking />
    </div>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <Link href={href} className="block text-ink-2 hover:text-ink">{children}</Link>;
}
