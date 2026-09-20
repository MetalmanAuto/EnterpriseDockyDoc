import type { Metadata } from 'next';
import LegalPage from '@/components/marketing/LegalPage';

export const metadata: Metadata = { title: 'DockyDoc refunds and cancellation' };

export default function RefundsPage() {
  return (
    <LegalPage
      title="Refunds and cancellation"
      updated="21 September 2026"
      intro="Short version: cancel any time, yearly plans have a 14-day money-back promise, monthly plans stop at the end of the month you paid for."
    >
      <section>
        <h2>Cancelling</h2>
        <p>Cancel from Settings, Plan, at any time. No email, no call. Your plan stays active until the end of the period you have already paid for, and then the account drops to the Free plan. Your documents stay; anything over the Free limits becomes read-only until you upgrade or reduce it.</p>
      </section>
      <section>
        <h2>Yearly plans</h2>
        <p>If you cancel within 14 days of first paying for a yearly plan you get the full amount back, no questions. After 14 days there is no refund for the rest of the year, but the plan stays active until the year ends.</p>
      </section>
      <section>
        <h2>Monthly plans</h2>
        <p>Monthly payments are not refunded. Cancel and the plan ends at the end of the current month.</p>
      </section>
      <section>
        <h2>AI action top-ups</h2>
        <p>A top-up is refundable within 14 days if none of its actions have been used. Once used, it is not refundable. Unused top-up actions expire 12 months after purchase.</p>
      </section>
      <section>
        <h2>Something went wrong</h2>
        <p>If you were charged twice, charged after cancelling, or could not use the service because of a fault on our side, write to <a href="mailto:support@dockydoc.app">support@dockydoc.app</a> with the invoice number. We refund those within 5 working days of confirming them.</p>
      </section>
      <section>
        <h2>How refunds are paid</h2>
        <p>Refunds go back to the card or account that paid, in the currency you paid in, through Razorpay (India) or Paddle (elsewhere). They usually appear within 7 to 10 working days depending on your bank. Taxes collected at checkout are refunded with the payment.</p>
      </section>
    </LegalPage>
  );
}
