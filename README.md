# For Wealth

A personal finance app, built for my own use first and as a product later.

1. **Budget tracker:** monthly nett income minus fixed expenses = what's left. _(built)_
2. **Spending tracker:** log every spend and look back over months and years. _(planned)_
3. **Debt planner:** model loans and find the fastest way to pay them off. _(planned)_

> **Current status:** frontend only. Nothing is saved yet, so refreshing the page clears everything. Saving data comes with the backend in Phase 1.

## Tech stack

React 19, TypeScript, Vite and Tailwind CSS v4. ESLint for linting, Prettier for formatting, pnpm for packages.

Planned: an Express + PostgreSQL API, login, hosting, and later a mobile app.

## Getting started

You need [Node.js](https://nodejs.org/) 22.12 or newer and [pnpm](https://pnpm.io/installation).

```bash
pnpm install
pnpm dev
```

Then open the URL it prints (usually http://localhost:5173).

## Scripts

| Command             | What it does                                          |
| ------------------- | ----------------------------------------------------- |
| `pnpm dev`          | Start the dev server with hot reload                  |
| `pnpm build`        | Typecheck, then build for production into `dist/`     |
| `pnpm preview`      | Serve the production build locally                    |
| `pnpm lint`         | Check the code with ESLint                            |
| `pnpm format`       | Format every file with Prettier                       |
| `pnpm format:check` | Check formatting without changing files (used for CI) |

## Project structure

```
src/
  App.tsx            app state: income, expenses, currency
  components/        UI pieces (IncomeCard, SummaryCard, ExpenseList, Card, MoneyInput)
  lib/budget.ts      budget maths, no React, easy to test
  lib/money.ts       money parsing and formatting
  types.ts           shared types
```

## How I work

- `main` always works. Every change goes on a branch and is merged through a pull request.
- Branch names: `type/short-description`, e.g. `fix/money-input-validation`.
- Commit messages: `type: what changed`, e.g. `feat: add expense categories`.
- Types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`.
- Before opening a pull request: `pnpm format:check && pnpm lint && pnpm build`.
