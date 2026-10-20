# Better Auth + Hono + Drizzle + PostgreSQL: setup for slice 1

> This is a dated snapshot and is not kept up to date. The decisions taken from it are recorded in [v1-spec.md → Setup decisions](../v1-spec.md#setup-decisions) and [Data and security](../v1-spec.md#data-and-security). Where this doc and the spec disagree (table names, password rules, Google in slice 1), follow the spec.

Researched on 2026-10-18. Covers only what slice 1 of [v1-spec.md](../v1-spec.md) needs. Every claim links to the official docs, source code, release notes or npm entry it comes from (see [Sources](#sources)). Anything not confirmed in a primary source is marked **(unverified)**.

## What slice 1 needs

From the spec ("Build order" item 1, "Architecture", "Running locally", "Rules"):

- An `apps/api` Hono app on Node, plus Postgres in a Podman container.
- Better Auth with **email + password** first, **Google sign-in** "late in slice 1 or later", **cookie sessions**, and **email verification required**.
- **Password reset** (the spec lists reset emails among the emails printed to the console).
- In dev, emails are **printed to the API console**. Resend comes in slice 7.
- `pnpm dev` runs web and API together, and **Vite proxies `/api/*` to the API**, so the browser sees one address. At launch the API serves the built web app from the same address, so there is no CORS in either setup.
- The user has a **currency picked at signup** (default MYR, fixed afterwards) and a **time zone** (detected from the browser). Both belong on the user record from the first migration, because every later slice depends on them.
- Every table holding user data has a `userId`, and every query is scoped to it.
- API integration tests run against a real Postgres.

Not needed in slice 1, noted only under [Later](#later): Resend, deploy, delete account (slice 6), the Settings screen.

## Recommended setup in short

1. **Postgres 18** in Podman, with a fully qualified image name: `docker.io/library/postgres:18`. Mount the volume at `/var/lib/postgresql`, which is the new location from 18 on.
2. **Drizzle ORM 0.45.x + drizzle-kit 0.31.x**, the current npm `latest`, with the **`pg` (node-postgres)** driver. Drizzle's website now installs the 1.0 release candidate by default. That gap is the biggest open decision below.
3. **The database schema, client and migrations live in `apps/api`** (`src/db/`). `packages/shared` stays free of server-only code because the web app imports it.
4. **Better Auth 1.7.10** with the Drizzle adapter (`provider: "pg"`). The auth tables come from `pnpm dlx auth@latest generate`. Note that the CLI package is now called `auth`, and `@better-auth/cli` is deprecated. Migration files come from `drizzle-kit generate` and are applied with `drizzle-kit migrate`.
5. **Mount the handler** with `app.all("/auth/*", c => auth.handler(c.req.raw))` on a `new Hono().basePath("/api")` app. A `requireSession` middleware puts a non-null `user` into the Hono context. That gives every route a `userId` to pass to queries.
6. **`BETTER_AUTH_URL=http://localhost:5173`** in dev, which is the Vite address and not the API port. Links in the console emails and the Google callback then go through the Vite proxy, and the browser's `Origin` is trusted automatically. No CORS middleware is needed.
7. Set **`requireEmailVerification: true`, `sendOnSignUp: true` and `sendOnSignIn: true`**. The verification and reset hooks call a `sendEmail()` that does `console.log` in dev.
8. Add **`currency` and `timeZone` as `user.additionalFields`**. A Better Auth `before` hook stops later changes to `currency`.
9. **Web:** `createAuthClient()` from `better-auth/react` with no `baseURL`, because the proxy makes it the same origin. Add `inferAdditionalFields<typeof auth>()`. The Hono RPC client is `hc<AppType>(window.location.origin)`. Both import **types only** from `@for-wealth/api`.
10. **Tests:** Vitest with `app.request(...)` against a separate `for_wealth_test` database in the same container. A helper signs a user up, marks the email verified and signs in to get the session cookie.

## Versions

Checked with `npm view <pkg> dist-tags` on 2026-10-18.

| Package | Use | `latest` on npm | Notes |
|---|---|---|---|
| `better-auth` | api + web | **1.7.10** (2026-10-16) | `beta` tag is 1.8.0-beta.1. Peer range accepts `drizzle-orm ^0.45.2 \|\| >=1.0.0-rc.1 <2`. |
| `auth` (Better Auth CLI) | api (devDependency, or `pnpm dlx`) | **1.7.10** | Binaries `auth` and `better-auth`. Needs **Node >= 22.12.0**. |
| `@better-auth/cli` | do not use | 1.4.21 | npm shows it as deprecated ("Package no longer supported"). Docs now use `npx auth@latest`; with pnpm that is `pnpm dlx auth@latest`. |
| `@better-auth/drizzle-adapter` | optional | 1.7.10 | Already a dependency of `better-auth`, which re-exports it as `better-auth/adapters/drizzle`. Install it on its own only for the `/relations-v2` entry (Drizzle 1.0). |
| `hono` | api + web (for `hono/client`) | **4.13.13** | `next` is 5.0.0-rc.1. Stay on 4 for now. |
| `@hono/node-server` | api | **2.1.5** | v2 needs Node >= 20. Same API as v1, but faster. |
| `@hono/zod-validator` | api | 0.9.1 | Peers: `zod ^3.25 \|\| ^4`, `hono >=4.11.2`. |
| `drizzle-orm` | api | **0.45.4** (2026-10-08) | `rc` tag is 1.0.0-rc.4 (2026-06-27). Drizzle's docs install `@rc`. See [Open decisions](#open-decisions). |
| `drizzle-kit` | api (dev) | **0.31.11** | `rc` is 1.0.0-rc.4. |
| `pg` / `@types/pg` | api | **8.23.1** / 8.23.1 | Recommended driver. |
| `postgres` (postgres.js) | alternative | 3.4.9 | Also supported by Drizzle. |
| `zod` | shared | 4.6.7 | Zod 4 implements Standard Schema, which Better Auth's field `validator` accepts. |
| `tsx` | api (dev) | 4.23.15 | Used by Hono's Node starter and by Drizzle's guides. |
| `vitest` | api, shared | 5.0.5 | Sets `NODE_ENV=test` when it is unset. |
| `typescript` | all | 7.0.2 | The repo pins `~6.0.2`. Moving to 7 is out of scope here. |
| PostgreSQL | container | **18.6** | 19 is at RC 1 (2026-10-15) and not yet final. |

## 1. Postgres in Podman

### Compose file

Put this at the repo root as `compose.yaml`. It parses with the `podman-compose 1.6.0` on this machine (`podman compose config`):

```yaml
name: for-wealth
services:
  db:
    image: docker.io/library/postgres:18   # fully qualified; see gotcha below
    environment:
      POSTGRES_USER: for_wealth
      POSTGRES_PASSWORD: for_wealth        # local dev only
      POSTGRES_DB: for_wealth
    ports:
      - "127.0.0.1:5432:5432"              # only reachable from this machine
    volumes:
      - pgdata:/var/lib/postgresql         # 18+: mount the parent, not .../data
      - ./db/init:/docker-entrypoint-initdb.d:ro,Z
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U for_wealth -d for_wealth"]
      interval: 5s
      timeout: 3s
      retries: 10
volumes:
  pgdata:
```

Add `db/init/01-test-db.sql` to create the test database once:

```sql
CREATE DATABASE for_wealth_test;
```

### Gotchas

- **Use the full image name.** This machine's `/etc/containers/registries.conf` sets `short-name-mode = "enforcing"` and three search registries (Fedora, Red Hat, docker.io). `000-shortnames.conf` has no `postgres` alias. In enforcing mode, a short name with several registries prompts when run in a terminal. When it is *not* run in a terminal, it fails, and compose does not run in one. Source: the `containers-registries.conf(5)` man page. Writing `docker.io/library/postgres:18` avoids the question.
- **Postgres 18 moved the data directory.** In the official image for 18 and later, `PGDATA` is `/var/lib/postgresql/18/docker` and the `VOLUME` is `/var/lib/postgresql`. Mount there. Mounting the old `/var/lib/postgresql/data` path from 17-era guides gives you storage that does not persist the way you expect. Sources: the image docs and the 18 Dockerfile.
- **Init scripts run only once.** Files in `/docker-entrypoint-initdb.d` run only when the data directory is empty. If you add `01-test-db.sql` after the first start, either create the database by hand or run `podman compose down -v` to wipe the volume.
- **SELinux.** This machine reports `Enforcing`. Bind mounts need a `:Z` (or `:z`) label, as in the init-scripts line above, or the container cannot read them. Named volumes like `pgdata` do not need it. Source: the `podman run --volume` docs.
- **`podman compose` is a wrapper.** It hands the work to an external provider: `docker-compose` if it is installed, otherwise `podman-compose`. Here it runs `/usr/bin/podman-compose` 1.6.0 and prints a banner each time. You can turn the banner off with `PODMAN_COMPOSE_WARNING_LOGS=false`. Source: the `podman-compose(1)` docs.
- **Version:** 18 is the newest final major release. 19 is at release candidate stage. Moving a volume to a new major version later needs `pg_upgrade` or a dump and restore, so pick a version and stay on it.

`DATABASE_URL=postgres://for_wealth:for_wealth@localhost:5432/for_wealth`

## 2. Drizzle in `apps/api`

### Driver: `pg` (node-postgres)

Drizzle supports `node-postgres` and `postgres.js` equally. Its get-started guide uses `node-postgres`. Its docs list some differences: `pg-native` can add about 10% speed, `pg` allows per-query type parsers, and postgres.js uses prepared statements by default, "which you may need to opt out of", for example on AWS. Better Auth's own Postgres examples use `pg`'s `Pool`, and `better-auth` declares `pg ^8` as an optional peer. **Use `pg`.**

```ts
// apps/api/src/db/client.ts
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema/index.js";

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle({ client: pool, schema });
export type Db = typeof db;
```

`drizzle({ client, schema })` matches the 0.45.4 type signature (`node-postgres/driver.d.ts`).

Timestamps: Drizzle's node-postgres session overrides the `pg` parsers for `timestamp` and `timestamptz`, and treats `timestamp` (without time zone) as UTC both ways (`pg-core/columns/timestamp.js` in 0.45.4). The `timestamp()` columns that Better Auth generates are therefore safe whatever the server's time zone is.

### Config and migration flow

```ts
// apps/api/drizzle.config.ts
import "dotenv/config"; // or run with Node's --env-file
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema",   // folder: auth.ts (generated) + app tables
  out: "./drizzle",            // committed SQL migrations
  dbCredentials: { url: process.env.DATABASE_URL! },
});
```

`schema` accepts a file, a folder, a glob or an array (drizzle-config-file docs).

There are three ways to change the database (Drizzle "migrations" docs):

| Command | What it does | Use it for |
|---|---|---|
| `drizzle-kit generate` | Compares the TS schema with the last snapshot and writes a SQL migration file | **Every schema change.** Commit the file. |
| `drizzle-kit migrate` | Applies migrations not yet applied, and records them in a migrations table | Local, test DB, and later production |
| `drizzle-kit push` | Changes the DB straight to match the schema, with no files | Throwaway experiments only |

Recommendation: use generate + migrate from the first migration. Slice 7 deploys to a managed Postgres, and committed SQL files are what make that repeatable.

For tests, or to migrate at startup, Drizzle also has a runtime migrator. **The signature differs between versions.** In 0.45.4 `migrationsFolder` is required:

```ts
import { migrate } from "drizzle-orm/node-postgres/migrator";
await migrate(db, { migrationsFolder: "./drizzle" }); // 0.45.x
```

Drizzle's current docs show `await migrate(db)` with no folder. That is the 1.0 API.

### Where the schema lives

Put it in `apps/api/src/db/schema/`:

```
apps/api/src/db/
  client.ts
  schema/
    auth.ts      <- generated by `pnpm auth:generate`; don't hand-edit
    index.ts     <- export * from "./auth.js"; export * from "./<app tables>.js"
```

Why not `packages/shared`? The web app imports `shared`, and the schema and client pull in `pg` and Node-only code. Why not a separate `packages/db`? Only the API uses the database in v1. Moving it to its own package later is a mechanical change (see [Open decisions](#open-decisions)).

App tables point at the auth `user` table, so "delete account" (slice 6) can cascade:

```ts
// shape only; slice 2 owns the real tables
import { pgTable, text, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth.js";

export const category = pgTable("category", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  // ...
});
```

(`uuid` matches the `user.id` type only if you pick `generateId: "uuid"`. With Better Auth's default it would be `text`. See [Open decisions](#open-decisions).)

## 3. Better Auth server config

### Environment variables (`apps/api/.env`, gitignored; commit `.env.example`)

```dotenv
DATABASE_URL=postgres://for_wealth:for_wealth@localhost:5432/for_wealth
BETTER_AUTH_SECRET=   # openssl rand -base64 32 (min 32 chars)
BETTER_AUTH_URL=http://localhost:5173   # the address the BROWSER uses (Vite), see below
PORT=3000
# later in slice 1:
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

- `secret`: Better Auth reads `BETTER_AUTH_SECRET` (or `AUTH_SECRET`). If neither is set, it uses a built-in default outside production and throws in production. `BETTER_AUTH_SECRETS` (plural) supports rotation later.
- `baseURL`: Better Auth reads `BETTER_AUTH_URL`. The docs warn not to rely on guessing it from the request.
- `trustedOrigins`: the `baseURL` origin is trusted by default. Extra origins can come from config or `BETTER_AUTH_TRUSTED_ORIGINS` (comma-separated, read in `context/helpers.ts`).

**Why `BETTER_AUTH_URL` points at Vite (5173) and not at the API (3000).** This is my reading of the source, not something the docs say. The verification link is built as `${baseURL}/verify-email?token=…&callbackURL=…` (`api/routes/sign-in.ts`). The Google redirect URL also comes from `baseURL` (Google provider docs). With the proxy, the browser only ever talks to `localhost:5173`. Its `Origin` header is `http://localhost:5173`, which is trusted because it equals `baseURL`. Links in console emails also open through the proxy, so the session cookie lands on the address the app uses. Vite's proxy keeps the original `Host` header by default (`changeOrigin` defaults to `false` in `http-proxy-3`, which Vite's proxy is built on). At launch `BETTER_AUTH_URL` becomes the one public URL.

### `apps/api/src/auth.ts`

```ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle"; // re-export of @better-auth/drizzle-adapter
import { APIError, createAuthMiddleware } from "better-auth/api";
import { db } from "./db/client.js";
import * as authSchema from "./db/schema/auth.js";
import { sendEmail } from "./email.js";

export const auth = betterAuth({
  appName: "For Wealth",
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,

  database: drizzleAdapter(db, {
    provider: "pg",
    schema: authSchema,   // explicit; otherwise the adapter falls back to db._.fullSchema
    transaction: true,    // default false; see "Password reset" below
  }),

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      void sendEmail({ to: user.email, subject: "Reset your password", text: url });
    },
  },

  emailVerification: {
    sendOnSignUp: true,                // default already follows requireEmailVerification
    sendOnSignIn: true,                // default false; resend link when unverified user signs in
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      void sendEmail({ to: user.email, subject: "Verify your email", text: url });
    },
  },

  user: {
    additionalFields: {
      currency: { type: "string", required: true, defaultValue: "MYR" },
      timeZone: { type: "string", required: true, defaultValue: "UTC" },
    },
  },

  hooks: {
    // Currency is chosen at signup and fixed afterwards (v1-spec "Money").
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path === "/update-user" && ctx.body && "currency" in ctx.body) {
        throw new APIError("BAD_REQUEST", { message: "Currency can't be changed" });
      }
    }),
  },

  advanced: {
    database: { generateId: "uuid" }, // see Open decisions
  },
});

export type Auth = typeof auth;
```

```ts
// apps/api/src/email.ts: dev mailer (Resend replaces the body in slice 7)
export async function sendEmail(msg: { to: string; subject: string; text: string }) {
  console.log(`\n✉️  To: ${msg.to}\n   ${msg.subject}\n   ${msg.text}\n`);
}
```

Notes on these options:

- **Email verification.** With `requireEmailVerification: true`, sign-in with an unverified email returns **403**. The client docs show checking `ctx.error.status === 403`. Sign-up returns the same 200 whether or not the email already exists, which prevents anyone learning which emails have accounts. **Docs disagree here.** The email-password page says `sendVerificationEmail` is called "every time a user tries to sign in". The email concepts page and the source (`api/routes/sign-in.ts`, also in the published 1.7.10 `dist`) show it is only resent when `emailVerification.sendOnSignIn` is `true`, and that defaults to `false`. Follow the source and set it.
- **Don't `await` the send.** Both email hooks are documented with `void sendEmail(...)`, to avoid timing attacks.
- **Password reset.** The client calls `requestPasswordReset({ email, redirectTo: "/reset-password" })`. The user lands on `/reset-password?token=…`, and the page calls `resetPassword({ newPassword, token })`. The token lasts 1 hour by default (`resetPasswordTokenExpiresIn`). With `transaction: true` on the Drizzle adapter, using up the token, revoking sessions and saving the password happen in one transaction. Without it, a failure partway through can leave the user's sessions revoked and the token used up.
- **Passwords** are hashed with scrypt and stored in the `account` table (`providerId = "credential"`). The defaults are 8 to 128 characters.
- **Sessions** last 7 days and are extended after 1 day of use (`expiresIn`, `updateAge`). The `cookieCache` option is **off** by default. Keep it off. While it is on, revoked sessions can stay valid until the cache expires.
- **Rate limiting** is on in production only by default. **Telemetry** defaults to off.
- **`better-auth/minimal`.** The installation docs suggest importing `betterAuth` from `better-auth/minimal` when you use an ORM adapter, to reduce bundle size. It is optional for a Node server.
- **Mount style.** The installation page uses `app.on(["POST","GET"], "/api/auth/*", …)`, and the newer Hono integration page uses `app.all(...)`. Both work. `app.all` passes every method through and lets Better Auth reject the ones it doesn't handle.

### `additionalFields`: currency and time zone

- `additionalFields` adds columns to `user`. The CLI includes them in the generated schema, and they are typed on the server and, with the client plugin, in the browser. `input` defaults to `true`, which means the field is accepted on sign-up and on `update-user`. That is why the hook above blocks changes to `currency`. `timeZone` stays editable for the Settings screen in slice 6.
- `defaultValue` is applied in JavaScript only and does not create a database default. It matters for Google sign-ups, which cannot send these fields.
- Sign-up from the web: `authClient.signUp.email({ name, email, password, currency, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone })`. Better Auth's sign-up requires `name`, so the form needs a name field.
- **Validation (source only, not in the docs).** In 1.7.10 a field can also take `validator: { input: <Standard Schema> }`, checked in `db/schema.ts` `parseInputData`. A Zod 4 schema from `packages/shared` (for example a currency enum, or a time zone checked with `Intl`) would plug in there. It must be synchronous. **(Unverified in a running app.)** The fallback is to check `ctx.body` in the same `before` hook.

### Generating the auth schema

```sh
cd apps/api
pnpm dlx auth@latest generate --config src/auth.ts --output src/db/schema/auth.ts
pnpm exec drizzle-kit generate # writes drizzle/<timestamp>_<name>/… SQL
pnpm exec drizzle-kit migrate
```

- The default output is `./auth-schema.ts` (in the CLI source and the published `auth@1.7.10`). The CLI docs say "schema.ts", which is out of date. Pass `--output` to be explicit.
- The CLI loads your config, so it needs the import graph of `src/auth.ts` to load outside the server (it resolves tsconfig paths). `--adapter drizzle --dialect postgresql` generates without using the adapter, though the config is still loaded.
- `auth migrate` only works with the built-in Kysely adapter. **With Drizzle, always generate first, then use drizzle-kit.**
- What gets generated for `pg`: tables **`user`, `session`, `account`, `verification`** (singular by default; `usePlural: true` gives plural names). Columns are **snake_case** in the database (`email_verified`, `user_id`) and camelCase in TypeScript. The adapter's `camelCase` option turns the snake_case off. Foreign keys use `onDelete: "cascade"`, `user_id` gets indexes, and relations are generated too (Relations v1 for Drizzle 0.45). The `id` type depends on `advanced.database.generateId`:
  - default: `text("id").primaryKey()`, with Better Auth generating the IDs
  - `"uuid"`: `uuid("id").default(sql\`pg_catalog.gen_random_uuid()\`).primaryKey()`
  - `"serial"`: `integer("id").generatedByDefaultAsIdentity()`
- `user` is a reserved word in Postgres. Drizzle quotes identifiers so the app is unaffected, but raw `psql` queries need `"user"`.
- **Schema check.** On startup Better Auth compares its expected schema with the Drizzle schema object and logs any mismatch. Requests fail while there is a mismatch. It does **not** check that migrations were applied to the database. `pnpm exec auth check schema --config src/auth.ts` runs the same check on demand. After changing auth config (new field or plugin), run generate, then drizzle-kit generate and migrate, then restart.

## 4. Hono app in `apps/api`

```
apps/api/src/
  index.ts                 serve() only
  app.ts                   builds the Hono app; exports AppType
  auth.ts  email.ts
  middleware/require-session.ts
  routes/me.ts
  db/…
```

Keeping `app.ts` separate from `index.ts` lets tests import the app without starting a server.

```ts
// middleware/require-session.ts
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { auth } from "../auth.js";

type AuthSession = typeof auth.$Infer.Session;
export type AuthedEnv = {
  Variables: { user: AuthSession["user"]; session: AuthSession["session"] };
};

export const requireSession = createMiddleware<AuthedEnv>(async (c, next) => {
  const result = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!result) throw new HTTPException(401, { message: "Not signed in" });
  c.set("user", result.user);
  c.set("session", result.session);
  await next();
});
```

This adapts the Better Auth Hono docs, whose example stores `session | null` and checks it in each handler. Rejecting in the middleware means handlers always get a non-null `user`, and `c.get("user").id` is the `userId` passed to every query (CLAUDE.md invariant).

```ts
// routes/me.ts
import { Hono } from "hono";
import { requireSession, type AuthedEnv } from "../middleware/require-session.js";

export const me = new Hono<AuthedEnv>()
  .use(requireSession)
  .get("/", (c) => {
    const u = c.get("user");
    return c.json({ id: u.id, email: u.email, name: u.name, currency: u.currency, timeZone: u.timeZone });
  });
```

```ts
// app.ts
import { Hono } from "hono";
import { auth } from "./auth.js";
import { me } from "./routes/me.js";

const app = new Hono().basePath("/api");
app.all("/auth/*", (c) => auth.handler(c.req.raw)); // must match Better Auth basePath (/api/auth)

const routes = app.route("/me", me);   // chain .route() calls so RPC types flow
export type AppType = typeof routes;
export default app;
```

```ts
// index.ts
import { serve } from "@hono/node-server";
import app from "./app.js";

serve({ fetch: app.fetch, port: Number(process.env.PORT ?? 3000) }, (info) =>
  console.log(`API on http://localhost:${info.port}`),
);
```

- If the app uses `basePath("/api")`, mount Better Auth at `/auth/*` and not `/api/auth/*` (callout in the Better Auth Hono docs). Register it before any catch-all route.
- **CORS:** not needed with the Vite proxy or with the same-address launch setup. If the web app is ever served from a different origin, add `cors({ origin: "<web origin>", credentials: true })` from `hono/cors` *before* the auth route, add that origin to `trustedOrigins`, and pass `init: { credentials: "include" }` to `hc`. A wildcard `*` origin cannot be used with credentials.
- RPC types only flow when routes are chained (`new Hono().get(...).post(...)`, `app.route(...).route(...)`). Hono's docs say to set `"strict": true` in **both** the client's and the server's tsconfig.

### `apps/api/package.json` (shape)

```json
{
  "name": "@for-wealth/api",
  "private": true,
  "type": "module",
  "exports": {
    ".": { "types": "./src/app.ts" },
    "./auth": { "types": "./src/auth.ts" }
  },
  "scripts": {
    "dev": "tsx watch --env-file=.env src/index.ts",
    "build": "tsc",
    "start": "node --env-file=.env dist/index.js",
    "test": "vitest",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "auth:generate": "auth generate --config src/auth.ts --output src/db/schema/auth.ts"
  }
}
```

(`auth:generate` assumes `auth` is a devDependency. Otherwise use `pnpm dlx auth@latest`. `tsx` passes Node flags such as `--env-file` through to Node, per the tsx docs.)

`apps/api/tsconfig.json`, following Hono's Node starter (`honojs/starter/templates/nodejs`):

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "NodeNext",
    "strict": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true,
    "types": ["node"],
    "rootDir": "./src",
    "outDir": "./dist"
  },
  "include": ["src"]
}
```

- `module: NodeNext` means relative imports need the `.js` extension (`./auth.js`), as in the snippets above.
- TypeScript 6.0 changed defaults: `strict` is now **true** by default, `module` defaults to `esnext`, and **`types` defaults to `[]`**. Listing `"types": ["node"]` is therefore required, otherwise `process` is undefined. The repo is on TS `~6.0.2`.
- Better Auth: keep `strict` (or at least `strictNullChecks`) on. If you hit "inferred type exceeds maximum length", check that `declaration` and `composite` are **off** in the project that compiles `auth.ts`.
- Better Auth does not support CommonJS (Express section of the installation docs). The repo is already `"type": "module"`.

## 5. Web client (`apps/web`)

```ts
// apps/web/vite.config.ts
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { "/api": { target: "http://localhost:3000" } }, // keep Host as localhost:5173
  },
});
```

```ts
// apps/web/src/lib/auth-client.ts
import { createAuthClient } from "better-auth/react";
import { inferAdditionalFields } from "better-auth/client/plugins";
import type { auth } from "@for-wealth/api/auth"; // type-only import

export const authClient = createAuthClient({
  // no baseURL: the API is on the same origin through the proxy
  plugins: [inferAdditionalFields<typeof auth>()],
});
// authClient.useSession(), signIn.email, signUp.email, signOut,
// sendVerificationEmail, requestPasswordReset, resetPassword, signIn.social({ provider: "google" })
```

```ts
// apps/web/src/lib/api.ts
import { hc } from "hono/client";
import type { AppType } from "@for-wealth/api";

export const client = hc<AppType>(window.location.origin);
// const res = await client.api.me.$get();
```

- The Better Auth docs say to install `better-auth` in both the client and the server package. `hono` must also be installed in `apps/web` (for `hono/client`), and Hono warns that **different Hono versions on each side** cause "Type instantiation is excessively deep" errors. Use a pnpm catalog so both apps share one version:

  ```yaml
  # pnpm-workspace.yaml
  packages: [apps/*, packages/*]
  catalog:
    hono: ^4.13.13
    better-auth: ^1.7.10
    zod: ^4.6.7
  ```

  Then reference it as `"hono": "catalog:"` in each `package.json`, and add `"@for-wealth/api": "workspace:*"` to `apps/web` devDependencies.
- **Proxy vs cross-origin.** The proxy keeps cookies first-party, so no CORS, `credentials`, `SameSite=None` or Safari ITP problems come up. The Better Auth cookie docs recommend a reverse proxy for exactly that reason. It also matches the same-address launch setup. A cross-origin setup (web 5173 calling API 3000 directly) would need CORS, `trustedOrigins`, and `credentials: "include"` on `hc`. It has no advantage here.
- **Secure cookies** are on only when `NODE_ENV=production` (or `useSecureCookies: true`), so plain `http://localhost` works in dev.

### Type-sharing pitfall (unverified for this repo)

`import type` from `@for-wealth/api` makes the **web** TypeScript project type-check the API's source files with the *web's* compiler options. `apps/web/tsconfig.app.json` has `"types": ["vite/client"]` and no `node`, so API files that use `process` may fail inside `tsc -b` for the web. Ways out, simplest first:

1. Add `"node"` to `types` in `tsconfig.app.json`. `@types/node` is already a web devDependency.
2. Hono's recommended "compile first" approach: the API emits `.d.ts` files (for example an `hcWithType` helper) and the web imports those. This also keeps the editor fast as routes grow. It may clash with Better Auth's advice to keep `declaration` off, so test it before relying on it.
3. TypeScript project references, which Hono's RPC docs also mention.

Start with option 1. Try option 2 if the editor slows down or the types get too deep.

## 6. Testing auth-protected routes

What the docs cover:

- Hono: `app.request(path, init)` sends a request straight into the app with no server. `testClient(app)` from `hono/testing` gives a typed client, but only for chained routes.
- Better Auth: under `NODE_ENV=test` it **skips the origin check** (`skipOriginCheck` defaults to `isTest()` in `context/create-context.ts`) and accepts the default secret. Vitest 5 sets `NODE_ENV ??= "test"` (in its `dist`). Rate limiting is off outside production.
- Better Auth's `testUtils()` plugin (`better-auth/plugins`) adds `ctx.test.createUser / saveUser / login / getAuthHeaders`. The docs recommend adding it only to a **separate test-only auth instance**, because it adds privileged helpers. Using it would mean building the app from an injected `auth`.

Recommended for slice 1. It uses the real code paths and needs no extra plugin:

```ts
// apps/api/test/helpers.ts (sketch)
import { eq } from "drizzle-orm";
import app from "../src/app.js";
import { db } from "../src/db/client.js";
import { user } from "../src/db/schema/auth.js";

export async function signedInCookie(email: string, password = "correct-horse-1") {
  const post = (path: string, body: unknown) =>
    app.request(`/api/auth${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  await post("/sign-up/email", { name: "Test", email, password, currency: "MYR", timeZone: "Asia/Kuala_Lumpur" });
  await db.update(user).set({ emailVerified: true }).where(eq(user.email, email)); // skip the inbox
  const res = await post("/sign-in/email", { email, password });
  return res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
}

// in a test:
// const cookie = await signedInCookie("a@example.com");
// const res = await app.request("/api/me", { headers: { cookie } });
// expect(res.status).toBe(200);
```

Test database:

- Use `DATABASE_URL=…/for_wealth_test` for Vitest (for example in a `.env.test` loaded by the test script).
- Run migrations in a Vitest `globalSetup` with `migrate(db, { migrationsFolder: "./drizzle" })`.
- Clear tables between tests with `TRUNCATE "user" CASCADE`, which also clears session and account rows through the foreign keys.

Slice 1 tests worth writing:

- `/api/me` returns 401 without a cookie.
- Sign-in before verification returns 403.
- Verified sign-in returns 200.
- `update-user` with `currency` returns 400.
- The verification email is logged (spy on `sendEmail`).

## 7. Google sign-in (late slice 1)

- Config: `socialProviders: { google: { clientId, clientSecret } }`. `baseURL` must be set or Google rejects the redirect (`redirect_uri_mismatch`).
- Redirect URI to register in Google Cloud: `http://localhost:5173/api/auth/callback/google` (through the proxy, because `BETTER_AUTH_URL` is 5173). Production uses `https://<domain>/api/auth/callback/google`.
- Client: `authClient.signIn.social({ provider: "google", callbackURL: "/" })`.
- `requireEmailVerification` does not apply to social sign-in. Google reports whether the email is verified. Account linking is on by default for providers that confirm the email is verified, so a Google login with the same address as an email+password account joins that account.
- Google sign-ups can't send `currency` and `timeZone`, so they get the `defaultValue`s. See [Open decisions](#open-decisions).

## 8. Known breaking changes and gotchas

- **The Better Auth CLI was renamed:** `@better-auth/cli` became `auth` (`pnpm dlx auth@latest …`; the docs show `npx`). The old package is deprecated on npm, and Hono's Better Auth example page still uses the old name.
- **The `auth` CLI requires Node >= 22.12.** The root `package.json` says `"node": ">=22"`. This machine has 22.23.1, which is fine, but raise `engines` to `>=22.12` so it can't be broken by accident. Hono 5 will also require 22.12+.
- **Better Auth 1.7 (from 1.6):** mostly additive. For this repo the relevant changes are:
  - joins config moved from `experimental` to `advanced.database.joins`
  - Drizzle relation keys changed under `usePlural`
  - the Drizzle adapter now throws on an invalid affected-row count
  - `getIp` was renamed `getIP`
  - when upgrading, run `pnpm exec auth upgrade`, then `generate`, review the output and migrate
  - keep `better-auth` and every `@better-auth/*` package on the same version
- **Drizzle docs vs npm `latest`:** orm.drizzle.team now shows `drizzle-orm@rc` / `drizzle-kit@rc` (1.0) in its install steps, while npm `latest` is 0.45.4 and is still getting patches (0.45.3 in September, 0.45.4 on 2026-10-08). The 1.0 line changes the migration folder layout (no `journal.json`, one folder per migration, `drizzle-kit up` to convert), switches relations to v2 (`defineRelations`), and drops the required `migrationsFolder` from `migrate()`. When reading Drizzle docs, check which version a snippet is written for.
- **Hono 5** is at RC: ESM only, runtime adapters moved to separate packages, `c.req.json()` returns `unknown`, and Node 22.12+ is required. Stay on 4.x. `@hono/node-server` 2.x already accepts `hono ^4 || ^5`.
- **`@hono/node-server` v2** needs Node 20+ and removed the Vercel adapter. Nothing else changed in its API.
- **Postgres 18 image volume path** changed (see section 1).

## Open decisions

| # | Decision | Options | Recommendation |
|---|---|---|---|
| 1 | Drizzle version | **0.45.x** (npm `latest`, still patched) vs **1.0 RC** (what Drizzle's docs now install; Better Auth supports it via `@better-auth/drizzle-adapter/relations-v2`) | **0.45.x.** You'll use this app every day from slice 2, so a stable release fits better than an RC that has been in testing since April. Moving to 1.0 later is a documented one-command migration-folder upgrade (`drizzle-kit up`) plus a relations rewrite, and slice 1 uses almost no relations. Revisit when 1.0 is tagged `latest`. |
| 2 | Postgres driver | `pg` vs `postgres` | **`pg`.** It is Drizzle's get-started default and what Better Auth's examples use. |
| 3 | ID type for auth tables (and so every `userId`) | default `text` (Better Auth random IDs) / `"uuid"` (native Postgres `uuid`, generated by the database) / `"serial"` | **`"uuid"`.** It gives one consistent, compact `uuid` type for every `userId` foreign key. It is hard to change once data exists, so decide before the first migration. |
| 4 | Auth table names | singular `user`/`session`/… (default) vs `usePlural: true` | **Default (singular)**, the most-used path. Name app tables the same way (`category`, `transaction`, `budget`) for consistency. Note that `transaction` and `user` are reserved words in SQL. Drizzle quotes them, but raw SQL needs quotes. |
| 5 | Where the db code lives | `apps/api/src/db` vs a new `packages/db` | **`apps/api/src/db`** for v1. Extract it if a second process (for example a Recurring Transactions job) ever needs it. |
| 6 | Migration workflow | generate + migrate vs push | **generate + migrate** from day one. Commit `apps/api/drizzle/`. |
| 7 | Currency and time zone for Google sign-ups | defaults (MYR / UTC) silently / a "confirm currency and time zone" step after the first Google sign-in / email-only signup until Settings exists | **Defaults plus a one-time confirm step** when you add Google. Without it, a Google user's currency is locked to MYR without being asked, and their time zone is UTC until they change it. You could record this as a small ADR, since it touches "currency fixed afterwards". |
| 8 | How to lock currency | `before` hook on `/update-user` (above) vs `input: false` with the signup value set in `databaseHooks.user.create.before` | **The `before` hook.** It keeps signup a single call. |
| 9 | Field validation | `validator.input` with shared Zod schemas (source only, not documented) vs checks in the `before` hook | **Try `validator.input`** with a Zod schema from `packages/shared`. Fall back to the hook if it misbehaves. |
| 10 | Session cookie cache | off (default) vs on | **Off.** It saves a database lookup per request but delays revocation, which matters for sign-out-everywhere and delete account. |
| 11 | Auto sign-in after verifying email | on vs off | **On** (`autoSignInAfterVerification: true`). One fewer step for the user. |
| 12 | Sharing API types with web | type-only source import (+ `node` in web `types`) vs compiled `.d.ts` (`hcWithType`) vs project references | **Source import first.** Switch to compiled types if the editor slows down. |
| 13 | Postgres major | 18 vs 19 (RC) | **18.** Upgrading majors later means a dump and restore or `pg_upgrade` on the volume. |
| 14 | How tests sign in | sign-up + flip `email_verified` + sign-in (above) vs Better Auth `testUtils()` on a test-only auth instance | **The first.** It needs no plugin and no change to how the app is built. |
| 15 | Node `engines` | `>=22` vs `>=22.12` | **`>=22.12`**, required by the `auth` CLI (and Hono 5 later). |

## Later

- **Resend (slice 7):** replace the body of `sendEmail()`. Better Auth lists Resend as a supported email provider. `BETTER_AUTH_URL` becomes the public `https://` URL, and secure cookies switch on with `NODE_ENV=production`.
- **Same-address hosting (slice 7):** `serveStatic` from `@hono/node-server/serve-static` serves `apps/web/dist`. Use an absolute `root` built from `import.meta.url`, because `root` is resolved against `process.cwd()`.
- **Delete account (slice 6):** Better Auth `user.deleteUser.enabled: true` (off by default), plus `ON DELETE CASCADE` on every app table's `user_id`.
- **Settings time zone (slice 6):** `authClient.updateUser({ timeZone })`. This is already allowed because `input` defaults to `true`.
- **Joins:** `advanced.database.joins: true` speeds up `get-session`. It needs the generated relations to be passed in the schema. Optional.
- **Secret rotation:** `BETTER_AUTH_SECRETS`.

## Sources

Docs pages were read from each project's docs source at these commits, which matched the published versions on 2026-10-18. Better Auth: `better-auth/better-auth@d0ca6d5` (package version 1.7.10). Hono docs: `honojs/website@7838d77`. Drizzle docs: `drizzle-team/drizzle-orm-docs@6659ce0`. Behaviour that matters was rechecked in the published npm tarballs (`better-auth@1.7.10`, `auth@1.7.10`, `drizzle-orm@0.45.4`, `@hono/node-server@2.1.5`, `vitest@5.0.5`).

**Better Auth**
- Hono integration (mount, CORS, session middleware, RPC credentials): https://better-auth.com/docs/integrations/hono
- Installation (env vars, adapters, `better-auth/minimal`, mount, no CJS): https://better-auth.com/docs/installation
- Drizzle adapter (generate → drizzle-kit, table/field naming, `usePlural`, `schemaName`, relations v2, joins, date columns): https://better-auth.com/docs/adapters/drizzle
- CLI (`auth`, generate/migrate/check/upgrade/secret): https://better-auth.com/docs/concepts/cli
- Database (schema validation, `additionalFields`, `input`/`returned`, ID generation, core schema): https://better-auth.com/docs/concepts/database
- TypeScript (strict, `$Infer`, `inferAdditionalFields`): https://better-auth.com/docs/concepts/typescript
- Email & password (verification, 403, enumeration protection, reset flow, `transaction: true`, scrypt, options table): https://better-auth.com/docs/authentication/email-password
- Email (`sendOnSignUp`, `sendOnSignIn`, `autoSignInAfterVerification`): https://better-auth.com/docs/concepts/email
- Session management (expiry, cookie cache): https://better-auth.com/docs/concepts/session-management
- Cookies (secure cookies, Safari ITP, reverse proxy): https://better-auth.com/docs/concepts/cookies
- Client (`better-auth/react`, baseURL optional on same origin): https://better-auth.com/docs/concepts/client
- Options reference (`baseURL`, `trustedOrigins`, `secret`, `secrets`, `user.deleteUser`, `telemetry`): https://better-auth.com/docs/reference/options
- Hooks (`createAuthMiddleware`, `APIError`): https://better-auth.com/docs/concepts/hooks
- Google provider: https://better-auth.com/docs/authentication/google
- Users & accounts (account linking, delete user): https://better-auth.com/docs/concepts/users-accounts
- Rate limit: https://better-auth.com/docs/concepts/rate-limit
- Test Utils plugin: https://better-auth.com/docs/plugins/test-utils
- 1.7 upgrade guide: https://better-auth.com/docs/guides/1-7-upgrade-guide
- Source: sign-in `sendOnSignIn` / verify URL: https://github.com/better-auth/better-auth/blob/d0ca6d538db47547b0a842cfa44ca92a8ea9bba0/packages/better-auth/src/api/routes/sign-in.ts
- Source: email verification option types: https://github.com/better-auth/better-auth/blob/d0ca6d538db47547b0a842cfa44ca92a8ea9bba0/packages/core/src/types/init-options.ts
- Source: field `validator` / `input` parsing: https://github.com/better-auth/better-auth/blob/d0ca6d538db47547b0a842cfa44ca92a8ea9bba0/packages/core/src/db/type.ts and https://github.com/better-auth/better-auth/blob/d0ca6d538db47547b0a842cfa44ca92a8ea9bba0/packages/better-auth/src/db/schema.ts
- Source: `BETTER_AUTH_TRUSTED_ORIGINS`: https://github.com/better-auth/better-auth/blob/d0ca6d538db47547b0a842cfa44ca92a8ea9bba0/packages/better-auth/src/context/helpers.ts
- Source: origin check skipped in test: https://github.com/better-auth/better-auth/blob/d0ca6d538db47547b0a842cfa44ca92a8ea9bba0/packages/better-auth/src/context/create-context.ts
- Source: Drizzle adapter config (`provider`, `usePlural`, `camelCase`, `transaction`, `schemaName`): https://github.com/better-auth/better-auth/blob/d0ca6d538db47547b0a842cfa44ca92a8ea9bba0/packages/drizzle-adapter/src/drizzle-adapter.ts
- Source: `better-auth/adapters/drizzle` re-export: https://github.com/better-auth/better-auth/blob/d0ca6d538db47547b0a842cfa44ca92a8ea9bba0/packages/better-auth/src/adapters/drizzle-adapter/index.ts
- Source: CLI Drizzle generator (default `./auth-schema.ts`, snake_case, ID types): https://github.com/better-auth/better-auth/blob/d0ca6d538db47547b0a842cfa44ca92a8ea9bba0/packages/cli/src/generators/drizzle.ts and snapshot https://github.com/better-auth/better-auth/blob/d0ca6d538db47547b0a842cfa44ca92a8ea9bba0/packages/cli/test/__snapshots__/auth-schema-pg-uuid.txt
- npm: https://www.npmjs.com/package/better-auth, https://www.npmjs.com/package/auth, https://www.npmjs.com/package/@better-auth/cli, https://www.npmjs.com/package/@better-auth/drizzle-adapter

**Hono**
- Node.js getting started (`serve`, port, static files): https://hono.dev/docs/getting-started/nodejs
- CORS middleware: https://hono.dev/docs/middleware/builtin/cors
- RPC (`hc`, cookies, strict in monorepos, chaining, version mismatch, project references, compile-first): https://hono.dev/docs/guides/rpc
- Testing (`app.request`): https://hono.dev/docs/guides/testing
- Testing helper (`testClient`): https://hono.dev/docs/helpers/testing
- Migrating to v5: https://hono.dev/docs/guides/migrating-to-v5
- Better Auth example (uses the old CLI name): https://hono.dev/examples/better-auth
- Node starter template (tsx, NodeNext tsconfig): https://github.com/honojs/starter/tree/main/templates/nodejs
- `@hono/node-server` v2.0.0 release notes: https://github.com/honojs/node-server/releases/tag/v2.0.0
- npm: https://www.npmjs.com/package/hono, https://www.npmjs.com/package/@hono/node-server, https://www.npmjs.com/package/@hono/zod-validator

**Drizzle**
- PostgreSQL connection (node-postgres vs postgres.js): https://orm.drizzle.team/docs/get-started-postgresql
- Get started, new PostgreSQL project: https://orm.drizzle.team/docs/get-started/postgresql-new
- Migrations fundamentals (options 1–6): https://orm.drizzle.team/docs/migrations
- Drizzle Kit overview: https://orm.drizzle.team/docs/kit-overview
- Config file (`schema`, `out`): https://orm.drizzle.team/docs/drizzle-config-file
- Upgrade to v1: https://orm.drizzle.team/docs/upgrade-v1
- Releases (0.45.4, 0.45.3, drizzle-kit 0.31.11, v1 RCs): https://github.com/drizzle-team/drizzle-orm/releases
- npm: https://www.npmjs.com/package/drizzle-orm, https://www.npmjs.com/package/drizzle-kit, https://www.npmjs.com/package/pg, https://www.npmjs.com/package/postgres

**PostgreSQL, container image, Podman**
- PostgreSQL versioning policy (18.6 newest, 19 RC1 on 2026-10-15): https://www.postgresql.org/support/versioning/
- Official image docs (PGDATA / VOLUME change in 18, init scripts run once): https://github.com/docker-library/docs/blob/master/postgres/content.md (rendered at https://hub.docker.com/_/postgres)
- Postgres 18 Dockerfile: https://github.com/docker-library/postgres/blob/master/18/trixie/Dockerfile
- `podman compose` provider behaviour: https://docs.podman.io/en/latest/markdown/podman-compose.1.html
- Volume SELinux labels (`:z` / `:Z`): https://docs.podman.io/en/latest/markdown/podman-run.1.html
- Short-name resolution (`short-name-mode`): `man 5 containers-registries.conf` (containers-common 0.67.2 on this machine); upstream https://github.com/containers/image/blob/main/docs/containers-registries.conf.5.md

**Other**
- Vite `server.proxy`: https://vite.dev/config/server-options#server-proxy
- `http-proxy-3` options (`changeOrigin` default false): https://github.com/sagemathinc/http-proxy-3
- TypeScript 6.0 defaults (`strict`, `module`, `types`): https://devblogs.microsoft.com/typescript/announcing-typescript-6-0/
- pnpm catalogs: https://pnpm.io/catalogs
- tsx passes Node flags (`--env-file`): https://github.com/privatenumber/tsx/blob/master/docs/node-enhancement.md
- Vitest `NODE_ENV ??= "test"`: seen in the published `vitest@5.0.5` `dist` (no docs page found)
