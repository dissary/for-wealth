# For Wealth

Personal app for tracking and planning income and spending. pnpm monorepo: `apps/web` (React + Vite), `apps/api` (Hono), `packages/shared` (types, Zod schemas, money and date helpers).

## Docs

- **Domain terms**: [GLOSSARY.md](GLOSSARY.md). Name code, UI copy and discussion with these terms. When a new term is settled, add it there.
- **Behaviour and build order**: [docs/v1-spec.md](docs/v1-spec.md). Read before starting a slice or feature, or when a rule about money, dates, Budgets or Recurring Transactions is in question.
- **Architecture decisions**: [docs/adr/](docs/adr/). Read before changing the stack, the repo layout, or what gets recorded as an Expense. Add an ADR when a hard-to-reverse decision is made.

## Invariants

- Money is an integer in the currency's minor units (sen for MYR) end to end; convert only for display, using the currency's own number of decimal places, never a hard-coded 100.
- A Transaction's date is a calendar date in the user's time zone; compute today, this week and this month in that zone.
- Every query on user data takes the user ID as a required argument.

## Environment

- Containers run on Podman (`podman compose`); this machine has no Docker.
- Local only until slice 7 of the spec. In dev, emails print to the API console.
