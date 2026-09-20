import type { Metadata } from 'next';
import LegalPage from '@/components/marketing/LegalPage';

export const metadata: Metadata = { title: 'Contact DockyDoc' };

export default function ContactPage() {
  return (
    <LegalPage
      title="Contact"
      updated="21 September 2026"
      intro="DockyDoc is run by a small team, so email is the fastest way to reach us. Reply times are those of your plan: two working days on Personal, one on Business, priority on Team."
    >
      <section>
        <h2>Email</h2>
        <ul>
          <li>Help with the product: <a href="mailto:support@dockydoc.app">support@dockydoc.app</a></li>
          <li>Privacy requests and the Grievance Officer: <a href="mailto:privacy@dockydoc.app">privacy@dockydoc.app</a></li>
          <li>Security reports: <a href="mailto:security@dockydoc.app">security@dockydoc.app</a></li>
          <li>Invoices and payments: <a href="mailto:billing@dockydoc.app">billing@dockydoc.app</a></li>
        </ul>
      </section>
      <section>
        <h2>Post</h2>
        <p>Excelleta Tech Private Limited<br />Flat No. 706E, 7th Floor, Sector 19B Dwarka Front, Near MCD Toll<br />Dwarka, New Delhi, South West Delhi 110075, India<br />GSTIN 07AAHCE4776H1ZC</p>
      </section>
    </LegalPage>
  );
}
