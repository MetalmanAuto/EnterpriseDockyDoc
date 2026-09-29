# Record of processing activities

Excelleta Tech Private Limited, New Delhi. Product: DockyDoc (dockydoc.app). Contact: Nishant Jairath, nj@excelleta.tech. Current as of 29 September 2026. Written to satisfy GDPR Article 30 and to answer the same question under the DPDP Act 2023: what data, why, where, for how long, who sees it.

Every row is derived from the code and the live configuration, so when the code changes this file changes in the same pull request.

## A. Where Excelleta is the fiduciary / controller

| # | Activity | Data | People | Purpose and legal basis | Systems and location | Kept for |
| --- | --- | --- | --- | --- | --- | --- |
| A1 | Accounts and sign-in | Name, email, sign-in events, IP address, device, optional phone for two-factor | Every user | Provide the service (contract); security (legitimate interest) | Clerk, United States; users table in Neon, Singapore | Until account deletion, then 30 days |
| A2 | Workspaces and membership | Workspace name, members, roles, invitations | Users and invitees | Contract | Neon, Singapore | Until deletion |
| A3 | Billing | Plan, renewal dates, invoices, payment references, country, GST status. No card or bank details | Paying users | Contract; tax law (legal obligation) | Neon; Razorpay, India; Paddle, United Kingdom | Invoices 8 years (Indian tax law); the rest until deletion |
| A4 | Activity log | Who did what to which document, when, from which IP | Users and external link visitors | Security and accountability (legitimate interest; contract for the customer's own audit needs) | Neon, Singapore | 12 months |
| A5 | Transactional email | Email address, reminder and notification content, delivery events | Users | Contract | Resend, United States | Delivery events per Resend's retention [TO CONFIRM] |
| A6 | Onboarding and product email | Email, sign-up date, source | Users | Contract for account messages; consent for marketing, with unsubscribe | Resend, United States | Until unsubscribe or deletion |
| A7 | Ad measurement | Cookie identifiers, page visited, sign-up event | Website visitors who accept in the banner | Consent | Meta, LinkedIn, Google tags, loaded only after consent | Per each provider's cookie term |
| A8 | Support | Email conversations, what the person shows us | Users who write in | Contract, legitimate interest | Email to nj@excelleta.tech (a support@dockydoc.app mailbox is to be set up) | 24 months |
| A9 | Platform admin view | Aggregates and per-user counts derived from A1 to A4 | Users | Legitimate interest (running the service) | Neon, Singapore, read by platform admins only | Same as sources |

## B. Where Excelleta is the processor (customer documents)

| # | Activity | Data | People | Instruction | Systems and location | Kept for |
| --- | --- | --- | --- | --- | --- | --- |
| B1 | Storage of uploaded files and versions | Whatever the customer uploads: identity and travel documents, licences, certificates, policies, contracts, tax records | Customer's employees, clients, drivers, family members | Customer upload; DPA section 1 | AWS S3, Mumbai (ap-south-1), server-side encrypted, private bucket. Second-region copy: see note 1 | Until the customer deletes, then bin (30 to 90 days or retention policy), then shredded; backups expire within 35 more days |
| B2 | Reading documents (OCR and extraction) | Page images and text, extracted dates, names, numbers, issuer, confidence | Same | Automatic on upload; customer can correct | Azure Document Intelligence (OCR); Anthropic (extraction), United States; OpenAI or Mistral as OCR fallback. Text is sent to read and returned; not retained by the provider for training | Extracted fields kept with the document; provider retention per its terms (zero data retention where offered) |
| B3 | Search index | Document names, extracted text, labels | Same | Automatic | Search module in the API and Neon, Singapore | With the document |
| B4 | Reminders | Owner name and email or phone, document name, expiry date | Users the customer names | Customer sets reminders | Neon; Resend (email); WhatsApp Business Platform when enabled | With the document |
| B5 | Sharing | Share link, password hash, expiry, who opened it and when | Recipients of share links | Customer creates the link | Neon; S3 signed URLs | Until revoked or expired; log 12 months |
| B6 | API and assistant access | API key hash, requests, documents fetched | Customer's systems and assistants | Customer creates the key | Neon; the API on Render, Singapore | Key until revoked; requests in the activity log 12 months |
| B7 | Legal hold and retention policies | Hold flag, folder retention days | Same as B1 | Customer sets | Neon | Until cleared |
| B8 | Export and deletion | Zip of documents and JSON of details | Same | Customer requests from Settings | Generated on the API, delivered by signed link | Export link expires after download or within a day |

## Notes

1. The security page states a second-region copy of files in Singapore. The API's own credentials are deliberately not allowed to read the bucket's configuration, so this is verified from the AWS console, not from the code. Open item in `provider-agreements.md`.
2. Backups: Neon point-in-time restore window depends on the Neon plan [TO CONFIRM in the Neon console]. The monthly restore drill is a manual task in the operations calendar.
3. No special categories are collected by design. Customers may upload documents that reveal them (for example a passport shows nationality). The DPA puts the lawful basis for that on the customer.
4. Children: the service is for adults; a parent may store a child's documents (B1).
5. Automated decisions: none. Extracted dates are suggestions a person can correct; reminders are sent on dates the customer confirms or leaves in place.
