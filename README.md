# For Wealth

Track, plan and understand your spending, day by day, week by week, month by month.

## Layout

```
apps/web          React + Vite frontend
apps/api          Hono API, Drizzle schema and migrations (apps/api/drizzle)
packages/shared   Types, Zod schemas, money and date helpers (no server-only code)
db/init           SQL run once when the Postgres container is first created
docs/             Spec and decision records
```

## Getting started

Needs Node 22.12 or later, pnpm (the version in `package.json` → `packageManager`) and Podman.

1. Install dependencies:

   ```sh
   pnpm install
   ```

2. Start Postgres 18. It listens on `127.0.0.1:5432` only, keeps its data in the `pgdata` volume, and on first start also creates the `for_wealth_test` database used by the tests:

   ```sh
   podman compose up -d
   ```

3. Create the API's environment file and give it a real secret:

   ```sh
   cp apps/api/.env.example apps/api/.env
   sed -i "s|^BETTER_AUTH_SECRET=.*|BETTER_AUTH_SECRET=$(openssl rand -base64 32)|" apps/api/.env
   ```

   `apps/api/.env.example` lists every variable. The API refuses to start if one is missing or invalid. Real `.env` files are gitignored; never commit one.

4. Apply the database migrations:

   ```sh
   pnpm db:migrate
   ```

5. Run the web app and the API together:

   ```sh
   pnpm dev
   ```

   Open <http://localhost:5173>. The home page says "API connected" when the API can reach Postgres. Vite forwards `/api/*` to the API on port 3000, so the browser only ever talks to one address.

## Database changes

Edit the schema in `apps/api/src/db/schema/`, then:

```sh
pnpm db:generate   # writes a SQL migration to apps/api/drizzle; commit it
pnpm db:migrate    # applies it to the dev database
```

Never use `drizzle-kit push`.

## Checks

```sh
pnpm lint
pnpm typecheck
pnpm test
```

`pnpm test` needs Postgres running (step 2). The API tests always use the `for_wealth_test` database: they refuse to run against a database whose name doesn't end in `_test`, apply the migrations before the first test, and run one test file at a time. To run a single file:

```sh
pnpm --filter @for-wealth/api test test/health.test.ts
```

If the `for_wealth_test` database is missing because the volume was created before `db/init` existed, either create it by hand (`podman compose exec -T db createdb -U for_wealth for_wealth_test`) or reset the volume with `podman compose down -v`. Resetting deletes all local data.

<<<<<<< Updated upstream
=======
### CI

GitHub Actions runs the same checks, plus `pnpm build`, on every push to `main` and every pull request ([.github/workflows/ci.yml](.github/workflows/ci.yml)). The API tests run against a fresh Postgres 18 container. The pnpm version comes from `packageManager` in `package.json`, and Node from `engines.node`, so change them there, not in the workflow. Because `engines.node` is a minimum, CI uses the newest Node that satisfies it.

CI must pass before anything merges to `main`. Enforcing that is a repo setting: protect `main` with a branch protection rule or ruleset that requires the `check` status check.

The workflow's actions are pinned to a full commit SHA. To update one, use the SHA of the commit the new release's tag points to (for an annotated tag this differs from the tag's own SHA; `gh api repos/OWNER/REPO/commits/TAG --jq .sha` gives the commit), and update the version comment beside it.

## Troubleshooting

- **The home page says "API not connected".** The API isn't running or has crashed. Check the terminal running `pnpm dev` for its error, and check Postgres is up with `podman compose ps`.
- **The API stops with `Invalid environment`.** A value in `apps/api/.env` is missing or wrong; the message names it. A blank `BETTER_AUTH_SECRET` means the file was copied from the example but never given a secret: run the `sed` line from step 3.
- **The API stops saying `.env` was not found.** Step 3 was skipped.
- **Postgres won't start because port 5432 is in use.** Another Postgres is already running on this machine. Stop it, then run `podman compose up -d` again.
- **You want a clean database.** Run `podman compose down -v`, `podman compose up -d`, then `pnpm db:migrate`. This deletes all local data.

>>>>>>> Stashed changes
## Dependencies

Set in `pnpm-workspace.yaml`:

- Hono, Better Auth and Zod versions come from the pnpm `catalog`, so every package uses the same version. Reference them as `"catalog:"`.
- `minimumReleaseAge` stops pnpm installing versions published less than 3 days ago.
- Install scripts run only for packages set to `true` under `allowBuilds`. If an install fails with `ERR_PNPM_IGNORED_BUILDS`, decide whether that package really needs its script before allowing it.

## Docs

- [docs/v1-spec.md](docs/v1-spec.md): what v1 is and how it works
- [GLOSSARY.md](GLOSSARY.md): what each domain term means
- [docs/adr/](docs/adr/): why the hard-to-reverse decisions were made
