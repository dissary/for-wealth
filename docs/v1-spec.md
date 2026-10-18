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
- Settings: Categories, currency (chosen at signup), time zone, week start, delete account and all data.
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
| Bank syncing (Plaid and similar) | not planned |
| Envelope / zero-based budgeting | not planned |
| Subcategories, tags, merchant field, attachments | add only if needed |
| "Every 2 weeks" and other custom schedules | add when asked |
| Native mobile app | after web v1 |

## Rules

### Money

- Amounts are stored as **integers in minor units** (RM12.50 is stored as `1250`). Never use floats for money. Divide by 100 only for display.
- Each user has one currency, picked at signup (default MYR) and fixed afterwards.

### Dates and time

- A Transaction has a **calendar date only** (`2026-10-18`), plus a separate created-at timestamp used for sorting.
- Each user has a time zone (detected from the browser). "Today", "this week" and "this month" are always calculated in the user's time zone, never the server's.
- Weeks start on Monday. Months follow the calendar. Both may become settings later.

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
| Auth | Better Auth: email + password and Google sign-in, cookie sessions, email verification required |
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

### Running locally (until launch)

Everything runs on the author's machine until it's ready for friends. No domain or hosting account is needed before then.

- Postgres runs in a Podman container.
- `pnpm dev` runs the web app and the API side by side. Vite proxies `/api/*` to the API, so the browser sees one address, just like production.
- Emails (verification, password reset) are printed to the API console instead of being sent. Resend is wired in only for production.
- Google sign-in works locally with a `localhost` redirect URL, but can be added late in slice 1 or later; email and password come first.

### Hosting (at launch)

One service at one address: the API serves the built web app, and data lives under `/api/*`. Deployed to Railway, Render or Fly.io, with managed Postgres (Neon or the host's own). One address means no CORS setup and simple login cookies.

### Data and security

- All data is stored in Postgres behind our own API ([ADR 0002](adr/0002-server-backed-from-day-one.md)).
- **Every table holding user data has a `userId`, and every query is scoped to it.** Make the user ID a required parameter so that forgetting it is a type error. One user reading another's data is the biggest risk in this app.
- HTTPS only. Secrets go in environment variables and are never committed.
- Keep Better Auth updated.
- "Delete my account" removes the user and all their data in one cascade delete.

## Testing

- Vitest tests in `packages/shared` for the money and date logic: Period boundaries, time zones, Free to Spend, Remaining, Budget usage, Recurring due dates (including day 31).
- API integration tests against a real Postgres, including **"user A cannot read or change user B's data"**.

## Build order

Each slice works all the way from the database to the screen.

1. Monorepo, API skeleton, Postgres, Better Auth, login screen. Runs locally only.
2. Categories (starter sets), adding and editing Transactions, the Transactions page with Day / Week / Month browsing. *You can use it every day from here.*
3. Dashboard totals for Income and Expenses.
4. Budgets (limits carry forward), progress bars, over-Budget warning.
5. Recurring Transactions, Estimates, Commitments, Expected Income, Free to Spend, Remaining, Upcoming.
6. Settings, delete account, polish, phone layout.
7. **First deploy**: hosting, managed Postgres, Resend, domain (optional). **Then invite friends.**

## Design

Use the `frontend-design` skill when building the UI. Replace shadcn/ui's default theme (colours, corner radius, font). Use one accent colour, and save red and green for over-Budget and under-Budget. For layout ideas, look at real finance apps (Copilot Money, Monarch, Lunch Money).
