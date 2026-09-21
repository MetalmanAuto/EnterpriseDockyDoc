import Link from 'next/link';
import Logo from '@/components/brand/Logo';
import ConsentBanner from '@/components/marketing/ConsentBanner';
import Tracking from '@/components/marketing/Tracking';

/**
 * Public pages: landing, pricing, security, legal. No sign-in needed and
 * no app chrome; a plain header and a footer that names the company.
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-canvas text-ink flex flex-col">
      <header className="sticky top-0 z-40 border-b border-stroke-soft bg-canvas/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Link href="/" aria-label="DockyDoc home" className="flex items-center">
            <Logo size={26} light motion="none" />
          </Link>
          <nav className="hidden sm:flex items-center gap-6 text-sm font-medium text-ink-2">
            <Link href="/pricing" className="hover:text-ink">Pricing</Link>
            <Link href="/security" className="hover:text-ink">Security</Link>
            <Link href="/help" className="hover:text-ink">Help</Link>
            <Link href="/developers" className="hover:text-ink">API</Link>
            <Link href="/login" className="hover:text-ink">Sign in</Link>
          </nav>
          <Link href="/register" className="h-9 px-4 inline-flex items-center rounded-lg bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700">
            Start free
          </Link>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-stroke-soft">
        <div className="mx-auto max-w-6xl px-4 py-10 grid gap-8 sm:grid-cols-3 text-sm">
          <div>
            <Logo size={22} light motion="none" />
            <p className="mt-3 text-ink-3 leading-relaxed">
              Every document with an expiry date, read by AI and remembered for you.
            </p>
          </div>
          <div className="space-y-1.5">
            <p className="font-semibold text-ink">Product</p>
            <FooterLink href="/pricing">Pricing</FooterLink>
            <FooterLink href="/security">Security and data</FooterLink>
            <FooterLink href="/help">Help centre</FooterLink>
            <FooterLink href="/developers">API and developers</FooterLink>
            <FooterLink href="/register">Start free</FooterLink>
            <FooterLink href="/login">Sign in</FooterLink>
          </div>
          <div className="space-y-1.5">
            <p className="font-semibold text-ink">Company</p>
            <FooterLink href="/terms">Terms of service</FooterLink>
            <FooterLink href="/privacy">Privacy policy</FooterLink>
            <FooterLink href="/refunds">Refunds and cancellation</FooterLink>
            <FooterLink href="/acceptable-use">Acceptable use</FooterLink>
            <p className="pt-2 text-ink-3 leading-relaxed">
              Excelleta Tech Private Limited<br />
              Flat No. 706E, 7th Floor, Sector 19B Dwarka Front, Dwarka, New Delhi 110075, India<br />
              GSTIN 07AAHCE4776H1ZC<br />
              <a href="mailto:support@dockydoc.app" className="hover:text-ink">support@dockydoc.app</a>
            </p>
          </div>
        </div>
        <p className="pb-6 text-center text-xs text-ink-3">&copy; {new Date().getFullYear()} Excelleta Tech Private Limited. DockyDoc is a product of Excelleta.</p>
      </footer>

      <ConsentBanner />
      <Tracking />
    </div>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <Link href={href} className="block text-ink-2 hover:text-ink">{children}</Link>;
}
