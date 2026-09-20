import type { Metadata } from 'next';
import LegalPage from '@/components/marketing/LegalPage';

export const metadata: Metadata = { title: 'DockyDoc acceptable use policy' };

export default function AcceptableUsePage() {
  return (
    <LegalPage
      title="Acceptable use"
      updated="21 September 2026"
      intro="DockyDoc is for storing and tracking documents you have the right to hold. This page lists what is not allowed. Breaking it can mean the account is suspended or closed under the terms of service."
    >
      <section>
        <h2>Do not upload or share</h2>
        <ul>
          <li>Documents you have no right to hold or share, including other people's identity documents obtained without their permission.</li>
          <li>Anything illegal to possess or distribute in your country or in India, or that infringes someone's copyright or trademark.</li>
          <li>Malware, or files designed to damage or gain access to systems.</li>
          <li>Material that is abusive, threatening, or exploits minors.</li>
        </ul>
      </section>
      <section>
        <h2>Do not use DockyDoc to</h2>
        <ul>
          <li>Forge, alter or misrepresent official documents.</li>
          <li>Send unsolicited messages through share links or invitations.</li>
          <li>Scrape, crawl or copy the service or other customers' data, or probe it for weaknesses without written permission. Genuine security reports are welcome at <a href="mailto:security@dockydoc.app">security@dockydoc.app</a>.</li>
          <li>Share one account or one API key between people or businesses to avoid buying the right plan.</li>
          <li>Run automated traffic that goes beyond the rate limits or degrades the service for others.</li>
          <li>Resell the service or present it as your own without an agreement with us.</li>
        </ul>
      </section>
      <section>
        <h2>AI features</h2>
        <p>The AI assistant and document reading are for your own documents. Do not use them to produce content that is unlawful, to attempt to extract other customers' data, or to work around the action limits of your plan.</p>
      </section>
      <section>
        <h2>What happens</h2>
        <p>If we see or are told of a breach we may remove the content, suspend the account, or close it, depending on how serious it is. Where we can we tell you first and give you a chance to fix it and to export your documents. We report unlawful material to the authorities where the law requires.</p>
      </section>
    </LegalPage>
  );
}
