# For Wealth

Track, plan and understand your spending, day by day, week by week, month by month.

**Status:** slices 1–5 of the build order in [docs/v1-spec.md](docs/v1-spec.md) are built. You can sign up, record Income and Expenses, browse them by Day, Week and Month, set Budgets, and add Recurring Transactions, and the Dashboard shows the month's Remaining, Free to Spend and what's still to come. Next is slice 6: Settings, deleting an account, Google sign-in and the phone layout. It runs locally only until slice 7.

## Layout

```
apps/web          React + Vite frontend
apps/api          Hono API, Drizzle schema and migrations (apps/api/drizzle)
packages/shared   Types, Zod schemas, money and date helpers (no server-only code)
docs/             Spec and decision records
```

## Getting started

Needs Node 22.12 or later, pnpm (the version in `package.json` → `packageManager`) and access to the Neon dev project. The database is hosted on [Neon](https://neon.tech), so there's nothing to run locally besides the app, and every machine works against the same dev data ([ADR 0006](docs/adr/0006-dev-database-on-neon.md)).

1. Install dependencies:

   ```sh
   pnpm install
   ```

2. In the Neon dev project, check there's a `for_wealth` database. Create it under **Databases** if it's missing.

3. Create the API's environment file:

   ```sh
   cp apps/api/.env.example apps/api/.env
   ```

   Then fill it in:

   - `DATABASE_URL`: from **Connect** in the Neon console, with **Connection pooling** off and the `for_wealth` database selected. Copy the connection string, not the `psql` command. Change `sslmode=require` to `sslmode=verify-full` to silence a warning from the `pg` driver.
   - `BETTER_AUTH_SECRET`: the output of `openssl rand -base64 32`.
   - `TEST_DATABASE_URL` is optional. You only need it to run the API tests on this machine (see [Checks](#checks)).

   `apps/api/.env.example` lists every variable. The API refuses to start if one is missing or invalid. Real `.env` files are gitignored; never commit one, and move it between machines only through something private, such as a password manager.

4. Apply the database migrations. This only does something the first time, or when a new migration has been added:

   ```sh
   pnpm db:migrate
   ```

5. Run the web app and the API together:

   ```sh
   pnpm dev
   ```

   Open <http://localhost:5173> and choose **Create an account**. No real email is sent in development: the verification link is printed in this terminal. Open it in the same browser to verify the email and sign in. Vite forwards `/api/*` to the API on the `PORT` set in `apps/api/.env` (3000 by default), so the browser only ever talks to one address, and the link and the session cookie use that address too.

   Signing up checks the password against [Have I Been Pwned](https://haveibeenpwned.com/Passwords), so it needs an internet connection. Only the first five characters of the password's SHA-1 hash leave the machine.

## Everyday use

Setup is a one-off. After that:

| To | Run |
|---|---|
| Start working | `pnpm dev` |
| Stop the app | `Ctrl+C` in the terminal running `pnpm dev` |
| Catch up after pulling new changes | `pnpm install`, then `pnpm db:migrate`. If the API then stops with `Invalid environment`, compare `apps/api/.env` with `apps/api/.env.example` and add the new variable. |

The API's log, including any errors, appears in the terminal running `pnpm dev`. Emails such as verification links print there too, because the app sends no real email until slice 7 of the spec.

### Working on more than one machine

Every machine shares the dev database, so a migration applied from one is there for all of them. Run `pnpm db:migrate` only from `main`, or from the branch you're about to merge. Migrating from an unfinished branch changes the tables under every other machine's code. If you need to work on two unfinished schema changes at once, give each machine its own Neon branch and point its `DATABASE_URL` at that branch.

If you run the tests locally, the same goes for them: they empty the tables in `for_wealth_test`, so don't run them on two machines at the same time.

## Database changes

Edit the schema in `apps/api/src/db/schema/`, then:

```sh
pnpm db:generate   # writes a SQL migration to apps/api/drizzle; commit it
pnpm db:migrate    # applies it to the dev database
```

Never use `drizzle-kit push`.

Better Auth's tables (`users`, `sessions`, `accounts`, `verifications`) are generated from its config in `apps/api/src/auth.ts` into `apps/api/src/db/schema/auth.ts`. Don't edit that file by hand. After changing anything in the config that affects the tables, such as a user field or a plugin, regenerate it first, then make the migration as above:

```sh
pnpm auth:generate
```

## Checks

```sh
pnpm lint
pnpm typecheck
pnpm test
```

CI runs every check on each push and pull request, so running `pnpm test` locally is optional. To run the API tests here, create a `for_wealth_test` database in the Neon dev project and set `TEST_DATABASE_URL` in `apps/api/.env` to your `DATABASE_URL` with `/for_wealth_test` in place of `/for_wealth`. The API tests always use that database: they refuse to run against a database whose name doesn't end in `_test`, apply the migrations before the first test, and run one test file at a time. To run a single file:

```sh
pnpm --filter @for-wealth/api test test/health.test.ts
```

### CI

GitHub Actions runs the same checks, plus `pnpm build`, on every push to `main` and every pull request ([.github/workflows/ci.yml](.github/workflows/ci.yml)). The API tests run against a fresh Postgres 18 container. The pnpm version comes from `packageManager` in `package.json`, and Node from `engines.node`, so change them there, not in the workflow. Because `engines.node` is a minimum, CI uses the newest Node that satisfies it.

CI must pass before anything merges to `main`. Enforcing that is a repo setting: protect `main` with a branch protection rule or ruleset that requires the `check` status check.

The workflow's actions are pinned to a full commit SHA. To update one, use the SHA of the commit the new release's tag points to (for an annotated tag this differs from the tag's own SHA; `gh api repos/OWNER/REPO/commits/TAG --jq .sha` gives the commit), and update the version comment beside it.

## Troubleshooting

- **Creating an account fails straight away, or the home page never shows you as signed in.** The API isn't running or has crashed. Check the terminal running `pnpm dev` for its error. `curl localhost:5173/api/health` says `ok` when the API can reach the database.
- **The first request after a break is slow.** Neon suspends an idle database and takes a moment to wake it. Later requests are fast again.
- **`/api` requests fail but the API log says it's listening.** Restart `pnpm dev` after changing `PORT`: Vite reads it only when it starts.
- **The page opens on port 5174 instead of 5173.** Something else is using 5173, so Vite moved. Stop the other app, or set `BETTER_AUTH_URL` to the new address; otherwise verification links and sign-in cookies point at the wrong one.
- **Creating an account says "Failed to check password".** The breach check couldn't reach Have I Been Pwned. Check the internet connection and try again.
- **The API stops with `Invalid environment` naming `BETTER_AUTH_URL`.** Your `apps/api/.env` predates it. Add `BETTER_AUTH_URL=http://localhost:5173`.
- **The API stops with `Invalid environment`.** A value in `apps/api/.env` is missing or wrong; the message names it. A blank `DATABASE_URL` or `BETTER_AUTH_SECRET` means the file was copied from the example but never filled in: see step 3.
- **The API stops saying `.env` was not found.** Step 3 was skipped.
- **Tests stop with `Set TEST_DATABASE_URL`.** Running them locally needs a test database: see [Checks](#checks). Otherwise, leave them to CI.
- **You want a clean dev database.** In the Neon console, drop and recreate the `for_wealth` database, then run `pnpm db:migrate`. This deletes all dev data, on every machine.

## Dependencies

Set in `pnpm-workspace.yaml`:

- Hono, Better Auth (and its `auth` CLI) and Zod versions come from the pnpm `catalog`, so every package uses the same version. Reference them as `"catalog:"`.
- `minimumReleaseAge` stops pnpm installing versions published less than 3 days ago.
- Install scripts run only for packages set to `true` under `allowBuilds`. If an install fails with `ERR_PNPM_IGNORED_BUILDS`, decide whether that package really needs its script before allowing it.

## Docs

- [docs/v1-spec.md](docs/v1-spec.md): what v1 is and how it works
- [GLOSSARY.md](GLOSSARY.md): what each domain term means
- [docs/adr/](docs/adr/): why the hard-to-reverse decisions were made
