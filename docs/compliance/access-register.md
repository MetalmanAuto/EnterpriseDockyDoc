# Access register

Who can reach production systems and data, reviewed every quarter and on the day anyone leaves. Current as of 29 September 2026. Every production login belongs to Nishant Jairath alone (confirmed 29 September 2026). Two-factor is on for some and being switched on for the rest; the column is updated as each is done.

| System | What access gives | Who has it | Two-factor | Last reviewed |
| --- | --- | --- | --- | --- |
| GitHub, MetalmanAuto/EnterpriseDockyDoc | Code, deploy to production by merging to main | Nishant Jairath | [YES/NO], org-wide requirement [YES/NO] | 29 Sep 2026 |
| Render, dockydoc-api-staging service | API servers, environment secrets, logs with user emails | Nishant Jairath | [YES/NO] | |
| Vercel, enterprise-docky-doc project | Web app, environment variables, deployment logs | Nishant Jairath | [YES/NO] | |
| Neon | The production database, every table | Nishant Jairath | [YES/NO] | |
| AWS account 934310620343 | Every customer file | Nishant Jairath | Root MFA [YES/NO] | |
| Clerk, DockyDoc production instance | User accounts, ability to impersonate | Nishant Jairath | [YES/NO] | |
| Anthropic console | API keys, usage | Nishant Jairath | [YES/NO] | |
| Azure subscription | OCR keys | Nishant Jairath | [YES/NO] | |
| Resend | Email logs with addresses and subjects | Nishant Jairath | [YES/NO] | |
| Razorpay | Payments, refunds, payouts | Nishant Jairath | [YES/NO] | |
| Paddle | Payments, refunds | Nishant Jairath | [YES/NO] | |
| DockyDoc platform admin (PLATFORM_ADMIN_EMAILS) | Every user's counts and plan, the ability to change plans | nishant@metalmanauto.com, contactnishant@gmail.com | NO on both (checked in Clerk 29 Sep 2026), to switch on from Settings in the app | 29 Sep 2026 |
| Claude Code sessions (this repository) | Code changes, and through stored keys the systems above | Nishant's Claude account | Anthropic account two-factor [YES/NO] | 29 Sep 2026 |

## Rules

1. Every account above has two-factor authentication on. Where a provider offers it, use an authenticator app, not SMS.
2. Nobody shares a login. A contractor gets their own account, scoped to what they need, removed the day the work ends.
3. Production secrets live in Render and Vercel environment settings, never in the repository, chat, or a laptop file.
4. Production data is not copied to a laptop. Debugging uses the sandbox with seed data.
5. This register is re-checked at the start of January, April, July and October, and the "last reviewed" column updated.
