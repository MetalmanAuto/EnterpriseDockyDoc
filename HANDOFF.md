
## Plans, limits and AI-action metering (added 21 Sept 2026)

- Tiers: FREE, PERSONAL ($6), BUSINESS ($23), TEAM ($59), plus ENTERPRISE (internal, unlimited). Limits and prices live in `api/src/modules/billing/plans.ts`; the public pricing table reads them from `GET /api/v1/billing/plans`.
- The plan belongs to the person (`User.plan`) and is mirrored onto every workspace they own. AI is metered in actions (`aiActionsUsed` per monthly period plus bought `aiCreditActions`), pooled across the workspaces they own. BYOK workspaces are not metered.
- `BillingService` (global) does every check and throws a 402 `PlanLimitException` with `code` and `upgradeTo`; the web app can act on those. Checks: document quota, workspace quota, member quota, API access (Business+), share-link controls (Free: no password, 7-day expiry), cross-workspace grants (Business+), activity export (Business+).
- Charges: one action per document read (2 for more than 20 pages, 3 for more than 50), one per assistant question, one per API find, one per report insight.
- Platform admins can hand out complimentary plans: `PATCH /api/v1/admin/users/:id/plan` and the dropdown on the admin page. Complimentary plans with an end date fall back to Free on their own.
- Migration `20260921000100_plan_on_users` put every existing account on a complimentary TEAM plan for six months, except owners of ENTERPRISE workspaces, who stay ENTERPRISE.
- Payments are not wired yet; the pricing page buttons are disabled until Razorpay (India) and Paddle (rest of world) land.
