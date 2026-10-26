# The dev database is hosted on Neon, not run in a local container

Development and tests use Postgres in a Neon dev project, not Postgres in a local Podman container. The author works from more than one machine, and a local container gave each machine its own setup and its own data. With Neon, a new machine needs only `pnpm install` and an `.env`, and every machine sees the same dev data. Neon was already the planned production database (see Hosting in the spec), so this adds no new vendor. We rejected Supabase because we'd use only its Postgres: auth and user isolation already live in our own API ([ADR 0002](0002-server-backed-from-day-one.md), [ADR 0004](0004-user-data-isolation-in-api.md)).

Which database production uses is decided at launch (slice 7). Nothing in the code changes either way: the deployed API is given its `DATABASE_URL` by the host.

## Consequences

- Development needs an internet connection.
- Machines share one dev database. Migrations are applied only from `main` or a branch about to merge. Work that needs separate schemas at the same time uses a Neon branch per machine.
- CI runs the tests on its own throwaway Postgres container, so it needs no Neon credentials. Running them locally is optional and needs a `for_wealth_test` database in Neon.
- `compose.yaml` and `db/init` are gone. Running Postgres locally again only needs a connection string: nothing in the code depends on where the database is.
