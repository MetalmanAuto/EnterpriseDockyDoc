# Access register

Who can reach production systems and data, reviewed every quarter and on the day anyone leaves. Current as of 29 September 2026. Names to be supplied by Nishant Jairath; until then the register lists the systems and what "access" means for each.

| System | What access gives | Who has it | Two-factor | Last reviewed |
| --- | --- | --- | --- | --- |
| GitHub, MetalmanAuto/EnterpriseDockyDoc | Code, deploy to production by merging to main | [NAMES] | Required by GitHub org setting? [YES/NO] | 29 Sep 2026 |
| Render, dockydoc-api-staging service | API servers, environment secrets, logs with user emails | [NAMES] | [YES/NO] | |
| Vercel, enterprise-docky-doc project | Web app, environment variables, deployment logs | [NAMES] | [YES/NO] | |
| Neon | The production database, every table | [NAMES] | [YES/NO] | |
| AWS account 934310620343 | Every customer file | [NAMES] | Root MFA [YES/NO] | |
| Clerk, DockyDoc production instance | User accounts, ability to impersonate | [NAMES] | [YES/NO] | |
| Anthropic console | API keys, usage | [NAMES] | [YES/NO] | |
| Azure subscription | OCR keys | [NAMES] | [YES/NO] | |
| Resend | Email logs with addresses and subjects | [NAMES] | [YES/NO] | |
| Razorpay | Payments, refunds, payouts | [NAMES] | [YES/NO] | |
| Paddle | Payments, refunds | [NAMES] | [YES/NO] | |
| DockyDoc platform admin (PLATFORM_ADMIN_EMAILS) | Every user's counts and plan, the ability to change plans | nishant@metalmanauto.com, contactnishant@gmail.com | Clerk two-factor [YES/NO] | 29 Sep 2026 |
| Claude Code sessions (this repository) | Code changes, and through stored keys the systems above | Nishant's Claude account | Anthropic account two-factor [YES/NO] | 29 Sep 2026 |

## Rules

1. Every account above has two-factor authentication on. Where a provider offers it, use an authenticator app, not SMS.
2. Nobody shares a login. A contractor gets their own account, scoped to what they need, removed the day the work ends.
3. Production secrets live in Render and Vercel environment settings, never in the repository, chat, or a laptop file.
4. Production data is not copied to a laptop. Debugging uses the sandbox with seed data.
5. This register is re-checked at the start of January, April, July and October, and the "last reviewed" column updated.
