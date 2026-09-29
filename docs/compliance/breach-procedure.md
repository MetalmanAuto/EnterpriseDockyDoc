# Personal data breach procedure

Adopted 29 September 2026. Owner: Nishant Jairath, Director, nj@excelleta.tech. One page, meant to be followed under pressure.

## What counts

A breach is any event where personal data is destroyed, lost, altered, disclosed to or accessed by someone who should not have it, by accident or on purpose. Examples that count: a share link exposed to the wrong person, a laptop with production credentials lost, a provider telling us they were breached, a bug that showed one customer another customer's documents, a ransomware or account takeover. Examples that do not, on their own: a failed login attempt, a phishing email nobody clicked, a vulnerability report with no evidence of exploitation.

## The clock

Two deadlines run from the moment we confirm a breach, not from the moment we suspect one.

- Customers whose documents are affected: told within 48 hours (DPA section 7).
- Data Protection Board of India: within 72 hours, and affected people without delay, for data under the DPDP Act, as the rules currently require.
- A European supervisory authority or the UK ICO: within 72 hours where GDPR or UK GDPR data is involved and the risk to people is not low. Affected people without undue delay where the risk is high.

Where DockyDoc is only the processor, the customer makes the regulator and individual notifications; we give them everything they need within the 48 hours.

## Steps

1. Whoever notices it tells Nishant Jairath at once, by phone, then by email with "breach" in the subject. Write down the time.
2. Contain. Revoke the credential, disable the key, rotate the secret, take the endpoint down, or revoke the share link. Prefer stopping the leak over preserving uptime. Keep the logs.
3. Assess, within 12 hours. What data, whose, how many people, which workspaces, since when, is it still happening, could it cause harm (identity theft, financial loss, safety). Write it down in the incident record (section below).
4. Decide, within 24 hours. Is it a personal data breach. If yes, which laws apply (India for everyone, GDPR or UK GDPR where an affected customer is in the EU or UK), and whether the risk to people is low, ordinary or high.
5. Notify. Affected workspace owners by email and in the app, using the template below, within 48 hours. Regulators and individuals as the clock section says. If the breach started at a provider, cite their notice.
6. Fix the cause, not just the symptom. Ship the fix, then confirm in the logs that the path is closed.
7. Close. Within 14 days write the post-incident note: what happened, timeline, what we changed, what we will change. Keep it for 5 years. Every breach, notifiable or not, goes in the incident register.

## Incident record

Keep one file per incident in `docs/compliance/incidents/YYYY-MM-DD-short-name.md` with: detected at, confirmed at, contained at, who was involved, data and people affected, workspaces affected, cause, notifications sent (to whom, when), fix, follow-ups. Never put the personal data itself in the record.

## Customer notice template

Subject: DockyDoc security incident affecting your workspace

We are writing because a security incident affected documents in your DockyDoc workspace "[NAME]". On [DATE] we confirmed that [WHAT HAPPENED, ONE SENTENCE]. It involved [WHICH DOCUMENTS OR DATA], concerning about [NUMBER] people, between [START] and [END]. We [WHAT WE DID TO STOP IT] and [WHAT WE HAVE DONE SINCE]. We suggest you [WHAT THEY SHOULD DO]. As the data fiduciary for these documents you may need to notify the people affected and the Data Protection Board of India [or your regulator]; we will supply anything you need for that. We will update you as we learn more. Contact: Nishant Jairath, nj@excelleta.tech, [PHONE].

## Contacts

- Data Protection Board of India: per the current notification on the Board's website at the time (check before sending).
- UK ICO: ico.org.uk, report a breach form.
- EU: the supervisory authority of the affected customer's country.
- Providers' security contacts: AWS, Neon, Render, Vercel, Clerk, Anthropic, Microsoft, Resend, Razorpay, Paddle, each through their support console; listed in `provider-agreements.md`.
