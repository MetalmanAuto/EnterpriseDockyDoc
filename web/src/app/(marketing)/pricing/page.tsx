import type { Metadata } from 'next';
import PricingTable from '@/components/billing/PricingTable';

export const metadata: Metadata = {
  title: 'DockyDoc pricing',
  description: 'Free for ten documents. Personal $6, Business $23 with API access, Team $59. Yearly plans are two months free.',
};

export default function PublicPricingPage() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-16">
      <h1 className="text-4xl font-extrabold tracking-tight text-center">Pricing</h1>
      <p className="mt-3 text-ink-2 text-center max-w-2xl mx-auto">
        Documents and people are generous on every plan. AI actions, workspaces and the API are what you pay more for. Change plan or cancel any time.
      </p>
      <div className="mt-10"><PricingTable signupHref="/register" /></div>
      <div className="mt-12 grid gap-6 sm:grid-cols-3 text-sm text-ink-2">
        <div>
          <p className="font-semibold text-ink">What counts as an AI action</p>
          <p className="mt-1">Reading one uploaded document of up to 20 pages (21 to 50 pages count as two, more as three), one assistant question, or one API request that finds or fetches a document.</p>
        </div>
        <div>
          <p className="font-semibold text-ink">Taxes and currency</p>
          <p className="mt-1">Indian customers pay in rupees through Razorpay; GST is included for Personal and added for companies. Everyone else pays in their own currency and local tax is added at checkout.</p>
        </div>
        <div>
          <p className="font-semibold text-ink">Money back</p>
          <p className="mt-1">Yearly plans carry a 14-day money-back promise. Monthly plans can be cancelled any time and stop at the end of the month paid for.</p>
        </div>
      </div>
    </section>
  );
}
