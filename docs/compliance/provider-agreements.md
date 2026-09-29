# Provider (sub-processor) agreements

Every provider that touches personal data must be under a written data processing agreement with obligations no weaker than our own DPA. Most large providers include it in the terms every customer accepts; some need a click in the dashboard. This is the checklist, current as of 29 September 2026. "Confirmed" means someone signed into the account and saw it accepted, or it is part of the standard terms; "to confirm" means Nishant needs to sign in and check.

| Provider | Role | Data | DPA | Where to accept or find it | Status |
| --- | --- | --- | --- | --- | --- |
| Amazon Web Services | File storage (S3, Mumbai) | Customer documents | AWS GDPR Data Processing Addendum is part of the AWS Service Terms for every account | Nothing to click. Keep a copy of the Service Terms page | Part of terms |
| Neon | Database (Singapore) | Accounts, document details, logs | DPA in Neon's terms; a signable version on request | Neon console, Settings, or legal@neon.tech | To confirm |
| Render | API servers (Singapore) | All data in transit through the API | Render DPA in its terms of service | Render dashboard, Account, Legal | To confirm |
| Vercel | Web app delivery | Requests, cookies, country header | Vercel DPA, accepted per team in the dashboard | Vercel dashboard, Team Settings, Legal, DPA | To confirm, click if not accepted |
| Clerk | Sign-in | Names, emails, sign-in events | Clerk DPA in its terms | Clerk dashboard, or clerk.com/legal/dpa | To confirm |
| Anthropic | AI extraction and assistant | Document text | Anthropic Commercial Terms include a DPA; zero data retention available | console.anthropic.com, Organisation settings, Legal | To confirm; request zero data retention |
| Microsoft Azure | OCR (Document Intelligence) | Page images and text | Microsoft Products and Services DPA, part of the subscription | Nothing to click; note the Azure region in use | Part of terms |
| OpenAI | OCR fallback | Page images and text | OpenAI DPA, signable online for API customers | platform.openai.com, Organisation, Legal, DPA | To confirm, sign if not done |
| Mistral | OCR fallback | Page images and text | Mistral DPA in its terms | console.mistral.ai, or legal@mistral.ai | To confirm |
| Resend | Email | Email addresses, message content | Resend DPA in its terms | resend.com/legal/dpa | To confirm |
| Razorpay | Payments (India) | Buyer name, email, phone, payment details held by Razorpay | Razorpay is an independent payment aggregator regulated by RBI; its terms govern | Nothing to sign for our side | Part of terms |
| Paddle | Payments (rest of world), merchant of record | Buyer details, invoices | Paddle is the merchant of record and an independent controller for its part; its terms govern | Nothing to sign | Part of terms |
| Meta, LinkedIn, Google | Ad measurement tags | Cookie identifiers after consent | Each has controller terms for measurement | Accepted when the ad account is created | When ads start |
| Google Workspace | Support mailbox | Support emails | Google Workspace DPA, part of the terms | Nothing to click | Part of terms |
| WhatsApp Business Platform (Meta) | Reminders and document requests, when enabled | Phone numbers, message content | Meta's WhatsApp Business Terms and Data Processing Terms | Accepted in Meta Business Manager on setup | Not yet in use |

## Also to verify from the AWS console

The API's own credentials are limited to reading and writing objects, on purpose, so these bucket settings could not be checked from the code. Sign in to the AWS console as the account owner and record the answers here.

1. Bucket `dockydoc-prod`, Properties: Versioning is Enabled.
2. Bucket `dockydoc-prod`, Properties: Default encryption is on (SSE-S3 or SSE-KMS).
3. Bucket `dockydoc-prod`, Permissions: Block all public access is On.
4. Bucket `dockydoc-prod`, Management: a replication rule to a bucket in ap-southeast-1 (Singapore) exists and is Enabled. If not, the security page's "copy in Singapore" line must be made true or removed.
5. IAM: the user `dockydoc-api` has no console access and only S3 object permissions on that bucket.
6. The root account has MFA on and is not used day to day.
