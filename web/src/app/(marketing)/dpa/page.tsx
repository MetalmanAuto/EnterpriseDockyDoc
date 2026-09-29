import type { Metadata } from 'next';
import Link from 'next/link';
import LegalPage from '@/components/marketing/LegalPage';

export const metadata: Metadata = {
  title: 'DockyDoc data processing agreement',
  description: 'The agreement under which Excelleta Tech Private Limited processes personal data in the documents its Business and Team customers upload to DockyDoc.',
};

/**
 * The customer-facing processor agreement. It is part of the terms for
 * Business and Team plans, so a company that signs up is covered without
 * a separate signature; a countersigned PDF is offered on request.
 * Written to satisfy DPDP Act 2023 section 8 (processing under a valid
 * contract) and GDPR / UK GDPR Article 28 at the same time.
 */
export default function DpaPage() {
  return (
    <LegalPage
      title="Data processing agreement"
      updated="29 September 2026"
      intro="This agreement applies whenever a customer on a Business or Team plan (“you”, the Customer) uploads documents to DockyDoc that contain personal data about other people, such as employees, drivers, clients or their family members. For that data you decide the purpose and means, so you are the data fiduciary under India's Digital Personal Data Protection Act 2023 and the controller under the GDPR and UK GDPR, and Excelleta Tech Private Limited (“Excelleta”, “we”) is your data processor. It forms part of the terms of service and takes precedence over them on the subject of personal data."
    >
      <section>
        <h2>1. What we process, and why</h2>
        <ul>
          <li><strong>Subject matter:</strong> the files you upload to your DockyDoc workspaces, the text read from them, and the dates, names, numbers and other details extracted from them.</li>
          <li><strong>Purpose:</strong> to store the documents, find their expiry and renewal dates, remind the people you name, and hand documents over when you or someone you authorise asks. Nothing else.</li>
          <li><strong>Categories of people:</strong> whoever your documents are about, typically your employees and contractors, your clients and their staff, vehicle owners and drivers, and family members.</li>
          <li><strong>Categories of data:</strong> names, dates of birth, addresses, contact details, identity and travel document numbers, licence and permit details, vehicle and insurance details, financial and tax identifiers, and any other information that appears on the documents you choose to upload.</li>
          <li><strong>Duration:</strong> for as long as you keep the document in DockyDoc, plus the bin and retention periods described in section 8.</li>
        </ul>
      </section>

      <section>
        <h2>2. Your instructions</h2>
        <p>We process personal data only on your documented instructions. Your instructions are the terms of service, this agreement, and the actions you and your members take in the product (uploading, setting reminders, sharing, deleting, connecting an API key or assistant). We will not process the data for our own purposes, sell it, or use it to train AI models, and neither will our sub-processors. If a law we are subject to requires us to process the data in another way, we tell you first unless the law forbids it. If we think an instruction breaks the law, we tell you and may pause the instruction until it is resolved.</p>
        <p>You confirm that you have the lawful basis, notices and consents needed to give us the data, that you are the data fiduciary or controller for it or are authorised by the one who is, and that you will not upload categories of data that DockyDoc is not built for, such as health records intended for clinical use.</p>
      </section>

      <section>
        <h2>3. Confidentiality and staff</h2>
        <p>Only people who need access to run the service have it, they are bound by written confidentiality obligations, and their access is reviewed at least every quarter and removed the day they leave. Support staff look at a customer's documents only when the customer asks for help with them, and that access is logged.</p>
      </section>

      <section>
        <h2>4. Security</h2>
        <p>We keep the technical and organisational measures described on the <Link href="/security">security page</Link>, which is part of this agreement. In summary: encryption in transit and at rest, private storage with expiring signed links, role-based access, two-factor sign-in, an activity log, file versioning and a second-region copy, database point-in-time restore, and a monthly restore drill. Independent vulnerability testing is being arranged, and its summary will be available under section 9 once complete. We may improve these measures at any time and will not reduce their overall level during the term.</p>
      </section>

      <section>
        <h2>5. Sub-processors</h2>
        <p>You authorise us to use the sub-processors listed on the <Link href="/security">security page</Link> under “Who processes your data”. Each works under a written contract with obligations no less protective than this agreement, and we remain responsible to you for their work. If we intend to add or replace a sub-processor we email the workspace owner at least 30 days before it starts processing your data. If you object on reasonable data protection grounds and we cannot offer a way around it, you may end the affected plan and we refund the unused part of any prepaid period.</p>
      </section>

      <section>
        <h2>6. Helping you with people's rights</h2>
        <p>DockyDoc gives you the tools to answer requests from the people your documents are about: search, export, correction of extracted details, sharing, and deletion. If a person contacts us directly about data in your workspace we do not answer on your behalf; we pass the request to you within five working days and help you respond. Where you need help beyond the product's own tools, for example to identify every document mentioning a person, we assist at a reasonable charge if the work is substantial.</p>
        <p>We also help you with data protection impact assessments and consultations with a regulator where they concern our processing, by providing the information in this agreement, on the security page and in our audit reports.</p>
      </section>

      <section>
        <h2>7. Personal data breaches</h2>
        <p>If we become aware of a breach of security that leads to the accidental or unlawful destruction, loss, alteration, unauthorised disclosure of, or access to your personal data, we tell the workspace owner without undue delay and in any case within 48 hours of confirming it, by email and in the app. The notice says what happened, which data and roughly how many people are affected, what we have done and what we suggest you do, and who to contact. We update it as we learn more. Notifying the Data Protection Board of India, a European supervisory authority, the UK ICO or the affected people is your decision as fiduciary or controller, and we give you what you need to do it in time.</p>
      </section>

      <section>
        <h2>8. Deletion and return</h2>
        <p>You can export every document and its details from Settings at any time, in a standard format, at no charge. When you delete a document it goes to the bin for the period your plan sets (30 to 90 days, or the retention policy you choose) and is then shredded from storage, with copies in backups expiring within a further 35 days. When you delete a workspace or your account, or your plan ends, all its documents and personal data are deleted on the same schedule unless a law requires us to keep something, in which case we keep only that, only for as long as required, and tell you what it is. We certify deletion in writing on request.</p>
      </section>

      <section>
        <h2>9. Audits</h2>
        <p>We make available the information you reasonably need to check that we keep this agreement: this page, the security page, our latest vulnerability test summary, and, once obtained, our ISO 27001 certificate and SOC 2 report. If those do not answer your question, you or an independent auditor you appoint may audit our processing once in any 12 months, on 30 days' written notice, during working hours, without disrupting the service and under confidentiality, at your cost. We may also be audited at our own cost after a breach affecting your data.</p>
      </section>

      <section>
        <h2>10. Where data goes</h2>
        <p>Files are stored in Mumbai, India, with a copy in Singapore; the database and servers are in Singapore; some sub-processors are in the United States, the United Kingdom and the European Union, as the security page lists. For personal data covered by the GDPR or UK GDPR, transfers to us and our sub-processors outside the EEA and UK take place under the European Commission's Standard Contractual Clauses (module two, controller to processor, and module three where applicable) and the UK International Data Transfer Addendum, which are incorporated into this agreement by reference with you as data exporter and Excelleta as data importer, and the annexes completed with the information in sections 1, 4 and 5. If a regulator's decision makes those clauses insufficient, we agree an alternative lawful mechanism or you may end the affected plan.</p>
        <p>For data under the DPDP Act, we do not transfer personal data to any country or territory the Central Government has restricted by notification.</p>
      </section>

      <section>
        <h2>11. Liability, term and law</h2>
        <p>The limits on liability in the terms of service apply to this agreement, except that they do not limit either party's liability for a breach of section 2 (processing outside instructions) or for fines a regulator imposes because of that party's own breach. This agreement lasts as long as we hold your personal data, so it survives the end of your plan until deletion under section 8 is complete. It is governed by the law of India and the courts of New Delhi, and for GDPR or UK GDPR data the Standard Contractual Clauses and the UK Addendum apply their own governing law and forum where they require it.</p>
      </section>

      <section>
        <h2>12. Contacts and signing</h2>
        <p>Our contact for everything under this agreement is Nishant Jairath, Director, Excelleta Tech Private Limited, Flat No. 706E, 7th Floor, Sector 19B Dwarka Front, Near MCD Toll, Dwarka, New Delhi 110075, India, <a href="mailto:nj@excelleta.tech">nj@excelleta.tech</a>. Your contact is the owner of your workspace unless you tell us otherwise.</p>
        <p>By subscribing to a Business or Team plan you accept this agreement on behalf of your organisation. If your procurement process needs a signed copy, email us and we return a countersigned PDF within five working days. We tell workspace owners by email at least 30 days before a material change to this agreement; the date at the top is the version in force.</p>
      </section>
    </LegalPage>
  );
}
