# For Wealth: v1 spec

Decisions from the design session on 2026-10-18. Terms in **bold** are defined in [GLOSSARY.md](../GLOSSARY.md). Decisions that are hard to reverse have their reasons recorded in [docs/adr/](adr/).

## Who it's for

The author is the first user. Once the foundation works, it goes to friends and family, so v1 is built for multiple users with login from day one.

## Scope

### In v1

- Record **Income** and **Expense** **Transactions** by hand: amount, date, **Category**, optional note.
- Browse Transactions by **Period**: Day, Week, Month, with ‹ › to step back and forward (this is how "yesterday" works). Filter by Category.
- Monthly **Budgets** per Expense Category, with progress bars.
- **Recurring Transactions** (monthly, weekly, yearly) that create real Transactions on their due dates. Variable bills create an **Estimate** to confirm later.
- Dashboard: this month's **Expected Income**, Expenses, **Commitments**, **Free to Spend**, **Remaining** (and per-day for the rest of the month), Budget progress, upcoming recurring items, Estimates to confirm.
- Settings: Categories, currency (chosen at signup, shown read-only), time zone, delete account and all data.
- Desktop-first layout that also works in a phone browser.

### Deliberately not in v1

| Feature | When |
|---|---|
| CSV import from bank statements | v2 |
| Spending trend charts, Category pie charts | v1.1 |
| CSV export of your data | v1.1 |
| Savings goals | later |
| Pay-cycle months (e.g. the 25th to the 24th) | later setting |
| Money sources (cash, card, e-wallet) with balances and transfers | later, if ever (see ADR 0001) |
| Multiple currencies | later |
| Week start setting (weeks start on Monday in v1) | later setting |
| Two-factor sign-in | later |
| Bank syncing (Plaid and similar) | not planned |
| Envelope / zero-based budgeting | not planned |
| Subcategories, tags, merchant field, attachments | add only if needed |
| "Every 2 weeks" and other custom schedules | add when asked |
| Native mobile app | after web v1 |

## Rules

### Money

- Amounts are stored as **integers in the currency's minor units** (RM12.50 is stored as `1250`; ¥1500 is stored as `1500`). Never use floats for money. Convert only for display.
- Each user has one currency, picked at signup (default MYR) and fixed afterwards.
- Currencies don't all have 2 decimal places (JPY has 0, KWD has 3). The money helpers in `packages/shared` convert using the currency's own number of decimal places, never a hard-coded 100.
- Signup offers a fixed list of currencies kept in `packages/shared`, each stored with its ISO code and its number of decimal places: MYR, SGD, USD, EUR, GBP, AUD, JPY. JPY is on the list so the 0-decimal path is always tested. Adding a currency is a one-line change plus tests.

### Dates and time

- A Transaction has a **calendar date only** (`2026-10-18`), plus a separate created-at timestamp used for sorting.
- Each user has a time zone (detected from the browser). "Today", "this week" and "this month" are always calculated in the user's time zone, never the server's.
- Weeks start on Monday. Months follow the calendar. Neither is a setting in v1.

### When an Expense counts

An Expense is dated when the purchase is made, whatever it was paid with. Credit card bill payments, e-wallet top-ups and transfers to savings are **not recorded at all**. See [ADR 0001](adr/0001-expenses-recognised-at-purchase.md).

### Categories

- Every Category is either Income or Expense. Budgets apply only to Expense Categories.
- Categories are one level deep (no subcategories).
- Deleting a Category **archives** it: it's hidden from pickers, but old Transactions keep it and past totals don't change.
- Starter sets:
  - **Income:** Salary, Bonus, Side income, Other
  - **Expense:** Food, Transport, Housing, Utilities, Bills & Subscriptions, Shopping, Health, Entertainment, Family, Other

### Budgets

- Budgets are monthly only. Day and week views show a calculated figure (e.g. RM420 left ÷ 12 days = RM35/day).
- A month with no Budgets of its own copies the previous month's limits. Editing November leaves October unchanged.
- Unspent or overspent money **does not** carry over. Every month starts fresh.
- If the Budgets add up to more than Free to Spend, show a warning. Don't block it.

### Recurring Transactions

- Schedules: monthly on day N, weekly on a weekday, yearly on a date. Day 31 in a shorter month falls back to that month's last day.
- A Recurring Transaction creates the real Transaction **on its due date**, not at the start of the month. Commitments and Expected Income are calculated directly from the Recurring Transactions, so planning still sees the whole month.
- Variable amounts create an **Estimate**. It counts in all totals and Budgets right away, marked as unconfirmed, until the user confirms the real amount.
- Editing a Recurring Transaction affects only Transactions it hasn't created yet. Past ones never change.
- Yearly items count as a Commitment only in the month they're due.

### Dashboard maths (for one month)

```
Expected Income = Income recorded + recurring Income still due this month
Commitments     = Expenses scheduled by Recurring Transactions this month
Free to Spend   = Expected Income − Commitments
Remaining       = Free to Spend − Expenses not created by Recurring Transactions
Per day         = Remaining ÷ days left in the month
```

## Architecture

One pnpm monorepo ([ADR 0003](adr/0003-pnpm-monorepo.md)):

```
for-wealth/
  apps/web          React 19 + Vite
  apps/api          Hono API
  packages/shared   types, Zod schemas, money and date helpers
```

| Concern | Choice |
|---|---|
| API framework | Hono |
| Database | PostgreSQL, via Drizzle ORM |
| Validation | Zod (shared by API and forms) |
| Auth | Better Auth: email + password (Google sign-in in slice 6), cookie sessions, email verification required |
| Email | Resend |
| Web → API calls | Hono RPC typed client |
| Styling / components | Tailwind CSS + shadcn/ui, with a custom theme (not the defaults) |
| Routing | TanStack Router |
| Loading API data | TanStack Query |
| Forms | React Hook Form + Zod |
| Charts | Recharts |
| Dates | date-fns |
| Tests | Vitest |
| Local database | Postgres in a container (Podman on this machine) |

### Setup decisions

Settled on 2026-10-20 from [the slice 1 research](research/better-auth-hono-drizzle-postgres.md), which has the setup details and sources.

| Decision | Choice |
|---|---|
| Versions | Drizzle ORM 0.45.x and drizzle-kit 0.31.x (not the 1.0 RC), Postgres 18, Hono 4, Better Auth 1.7. Check whether a Drizzle docs snippet is written for 1.0 before using it. |
| Postgres driver | `pg` (node-postgres) |
| Where database code lives | `apps/api/src/db/`. `packages/shared` never imports server-only code. |
| Schema changes | `drizzle-kit generate`, then `drizzle-kit migrate`. Migrations are committed. Never `push`. |
| IDs | `uuid`, generated by Postgres, for the auth tables (`advanced.database.generateId: "uuid"`) and every app table. Every `user_id` is a `uuid`. |
| Table names | Plural, so none is a reserved SQL word: `users`, `sessions`, `accounts`, `verifications` (`usePlural: true`), then `categories`, `transactions`, `budgets`, `recurring_transactions`. Columns are snake_case. |
| User record | `name` (asked for at signup), `currency` and `timeZone`. Currency is locked after signup by a Better Auth `before` hook on `/update-user`. Fields are validated with the shared Zod schemas through `validator.input`, or in the same hook if that doesn't work. As built in slice 1: `currency` and `timeZone` use `validator.input`. `name` is a core field, so a `before` hook checks it on `/sign-up/email` and `/update-user`. That hook and the currency lock live in a small plugin (`apps/api/src/user-rules.ts`), so their error codes (`INVALID_NAME`, `CURRENCY_LOCKED`) are part of the `Auth` type the web app matches on. `currency` defaults to MYR, but `timeZone` has no default, so an email sign-up without one is rejected instead of silently getting UTC. Time zones are stored in their canonical IANA spelling, and fixed offsets such as `+08:00` are refused because they have no daylight saving rules. |
| Breach check | If Have I Been Pwned can't be reached, sign-up fails with an error rather than skipping the check (the plugin's behaviour). Tests answer its range API with a stub and fail any other network request. |
| Response time of sign-up and reset requests | Every answer from `/sign-up/email` and `/request-password-reset` takes at least 1 second (`apps/api/src/response-floor.ts`). A new email also writes the user and their account, and a reset request for a known email writes a reset token, so without a floor the timing would show which emails have accounts. Better Auth holds its resend-verification endpoint to 500 ms for the same reason. The floor sits above a normal sign-up (password hash plus the breach check), the slower of the two, so a known and an unknown email both finish under it on either path. |
| Password reset | "Forgot password?" on the sign-in page leads to `/forgot-password`, which asks for an email; the answer is the same whether or not it has an account. The emailed link (not awaited, like every email) works once, within 1 hour, and lands on `/reset-password` with `?token=`, or with `?error=` when it was used, has expired or was mangled; the page then says the link no longer works and offers a new one. The new password follows the sign-up rules, breach check included. Better Auth spends the token, deletes every session of the user and saves the password in one transaction (`revokeSessionsOnPasswordReset`, the adapter's `transaction: true`). Two additions of ours (`apps/api/src/reset-tokens.ts`): reset tokens are stored as a SHA-256 hash, not as they appear in the link, so reading the database doesn't give anyone a working link; and a reset also spends any other reset link the user asked for. That last step runs after the transaction (Better Auth's `onPasswordReset`); if it fails, the new password still stands and the failure is logged. Resetting doesn't verify the email: an account that was never verified still has to verify before signing in. |
| Getting a new verification link | Signing up again sends nothing for an email that already has an account. A new link comes from the "Send a new link" form shown with an expired or broken link (Better Auth's `/send-verification-email`, which answers the same for any email) or from signing in before verifying (`sendOnSignIn`). |
| Origin checks in tests | Better Auth turns its own origin check off when `NODE_ENV` is `test`. It is set back on (`advanced.disableOriginCheck: false`), so the tests exercise what production runs. |
| Sessions | Database sessions with Better Auth's defaults (7 days, extended after 1 day of use). Cookie cache off, so a revoked session stops working immediately. Auto sign-in after verifying email. |
| Routes that need a session | API routes sit behind `requireSession` (`apps/api/src/require-session.ts`). It answers 401 without a valid session, gives handlers a non-null `user` (whose `id` every query on user data takes), marks the answer `Cache-Control: no-store`, and passes on the cookie Better Auth sets when it extends the session, so any API call keeps it alive. `GET /api/me` returns the user's own ID, name, email, currency and time zone. In the web app, pages that need a session live under the `_signed-in` layout route, whose `beforeLoad` reads `/api/me` and sends anyone else to `/sign-in?redirect=<path>`. |
| Where links land | Every Better Auth link (verification emails, the sign-in `callbackURL`) comes back to `/sign-in`, carrying `?redirect=` when the user was going somewhere. A signed-in user there is sent on to that path; a broken link arrives with `?error=` and the page offers a new one. `redirect` is followed only if it parses to a path on the app's own origin (`apps/web/src/lib/redirect.ts`), otherwise it goes to `/`. |
| Wrong sign-in details | One message for a wrong password and an unknown email. Better Auth hashes a dummy password for an unknown email, so the timing matches too, and it checks the password before the verification state, so only someone with the right password learns an email is waiting to be verified (403, and a fresh link is sent). |
| Dev URLs | `BETTER_AUTH_URL` is the Vite address (`http://localhost:5173`), so cookies and email links go through the proxy. Slice 1 isn't done until clicking a verification link from the console signs the user in. |
| Web ↔ API types | `apps/web` imports types only from `@for-wealth/api`. Switch to compiled `.d.ts` files if the editor slows down. Hono, Better Auth and Zod versions are shared through a pnpm catalog. |
| Node | `engines` is `>=22.12`. |

### Running locally (until launch)

Everything runs on the author's machine until it's ready for friends. No domain or hosting account is needed before then.

- Postgres runs in a Podman container.
- `pnpm dev` runs the web app and the API side by side. Vite proxies `/api/*` to the API, so the browser sees one address, just like production.
- Emails (verification, password reset) are printed to the API console instead of being sent. Resend is wired in only for production.
- Google sign-in is added in slice 6 and works locally with a `localhost` redirect URL. Slice 1 is email and password only.

### Hosting (at launch)

One service at one address: the API serves the built web app, and data lives under `/api/*`. Deployed to Railway, Render or Fly.io, with managed Postgres (Neon or the host's own). One address means no CORS setup and simple login cookies.

Before inviting friends (slice 7):

- Rate-limit counters are stored in the database, not in memory, so they survive restarts.
- The client IP used for rate limiting is read from the host's proxy header, configured so it can't be faked.
- Migrations run as a separate database role. The app's role can read and write data but can't change the schema.
- A strict Content-Security-Policy on the served web app.
- Automatic dependency-update PRs (Renovate or Dependabot).

### Data and security

- All data is stored in Postgres behind our own API ([ADR 0002](adr/0002-server-backed-from-day-one.md)).
- **Every table holding user data has a `userId`, and every query is scoped to it.** Make the user ID a required parameter so that forgetting it is a type error. One user reading another's data is the biggest risk in this app. This is enforced in the API, not with Postgres row-level security ([ADR 0004](adr/0004-user-data-isolation-in-api.md)).
- Every app table's `user_id` references `users` with `ON DELETE CASCADE`. "Delete my account" removes the user and all their data in one delete.
- HTTPS only. Secrets go in environment variables and are never committed.
- Environment variables are checked with Zod at startup. The API refuses to start if `BETTER_AUTH_SECRET` is missing or shorter than 32 characters, and never falls back to Better Auth's default secret.
- Passwords: at least 10 characters, at most 128, and no rules about character types. (Lowered from 12 on 2026-10-21, by the author's choice. That is still above OWASP's minimum of 8, and the breach check below catches common short passwords.) Passwords found in known data breaches are rejected (Better Auth's `haveIBeenPwned` plugin). Resetting the password signs the user out everywhere.
- Signup and password reset never reveal whether an email has an account.
- All `/api/*` routes, not just Better Auth's, reject state-changing requests from other sites (Hono's `csrf()` middleware), as a second layer on top of `SameSite=Lax` cookies.
- Security headers on every response (Hono's `secureHeaders()`).
- Google sign-in (slice 6) must not join a Google login onto an email + password account whose email was never verified. Otherwise, someone could register a victim's email with their own password before the victim ever signs in with Google. Check this in Better Auth's account-linking behaviour and cover it with a test. Google sign-ups must also confirm currency and time zone once before using the app, instead of silently getting MYR and UTC. `users.time_zone` is `NOT NULL` with no default (slice 1), so the Google sign-up has to supply one when the user is created, or creating the user fails.
- Supply chain: the pnpm lockfile is committed. pnpm's `minimumReleaseAge` is set to 3 days, so package versions published only hours ago aren't installed. Packages can't run install scripts unless they're explicitly allowed.
- Keep Better Auth updated.

## Testing

- Vitest tests in `packages/shared` for the money and date logic: Period boundaries, time zones, Free to Spend, Remaining, Budget usage, Recurring due dates (including day 31).
- API integration tests against a real Postgres, including **"user A cannot read or change user B's data"** for every endpoint that touches user data.
- API tests use a separate `for_wealth_test` database, run one file at a time (`fileParallelism: false`) and empty the tables between tests. A test signs in by signing up, marking the email verified in the database, then signing in.
- Slice 1 auth tests: no session gives 401, sign-in before verifying gives 403, a verified sign-in works, currency can't be changed, a breached or short password is rejected, a cross-site POST is rejected, the verification email is sent, a signed-out session's cookie gives 401, a session in use is extended, and two users each see only their own details. Password reset: an unknown email gets the same answer as a known one, a valid link resets the password and the new one signs in while the old one doesn't, a session from before the reset gets 401, a used, expired or earlier link is refused, a weak new password is refused, and a failure while saving the password changes nothing.

## Build order

Each slice works all the way from the database to the screen.

1. Monorepo, API skeleton, Postgres, Better Auth (email + password, verification, password reset), login screen. Runs locally only.
2. Categories (starter sets), adding and editing Transactions, the Transactions page with Day / Week / Month browsing. *You can use it every day from here.*
3. Dashboard totals for Income and Expenses.
4. Budgets (limits carry forward), progress bars, over-Budget warning.
5. Recurring Transactions, Estimates, Commitments, Expected Income, Free to Spend, Remaining, Upcoming.
6. Settings, delete account, Google sign-in, polish, phone layout.
7. **First deploy**: hosting, managed Postgres, Resend, domain (optional), the "Before inviting friends" list under Hosting. **Then invite friends.**

## Design

Use the `frontend-design` skill when building the UI. Replace shadcn/ui's default theme (colours, corner radius, font). Use one accent colour, and save red and green for over-Budget and under-Budget. For layout ideas, look at real finance apps (Copilot Money, Monarch, Lunch Money).

The theme (slice 1, decided 2026-10-21) lives as tokens in `apps/web/src/index.css`. Components use the tokens, never their own colours.

- **Accent**: batik indigo (`#3e4eb3` light, `#92a6f1` dark), for primary actions, links and focus. Neutrals are tinted with the same hue. Indigo is far from both red and green, so it never reads as a Budget signal.
- **Red and green**: the `over-budget` and `under-budget` tokens only. So `destructive` (delete buttons, invalid fields) is ink, not red: the wording ("Delete Transaction") and a confirmation step carry the warning, which also works for people who can't tell red from green. For the same reason, an invalid form field always says what's wrong in words, not only with its border.
- **Type**: Instrument Sans, bundled from npm. Headings use its width axis at 85% (narrower). All digits are tabular (the same width), so amounts line up.
- **Corners**: 0.375rem base radius, tighter than shadcn's default.
- **Light and dark**: follows the device setting, in CSS only. A manual switch can come later if wanted.
- **Checked by tests** (`apps/web/test/`): text contrast meets WCAG AA in both modes, red and green appear only in the Budget tokens, components hard-code no colours, and the stylesheet loads nothing from another address.
