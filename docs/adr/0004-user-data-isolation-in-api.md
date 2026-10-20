# Users' data is kept apart in the API, not with Postgres row-level security

Each user's data is kept separate by the API: every data-access function takes the user ID as a required argument, and every endpoint has a test that one user cannot read or change another's data. We considered Postgres row-level security (RLS) as a second layer and chose not to use it in v1. It needs a database role that isn't the table owner, the user ID set in every database transaction, and an exception for Better Auth's own tables, and all of that would fail silently if misconfigured. For a small number of trusted users, a required `userId` checked by the type system and covered by tests gives the protection at a fraction of that complexity.

## Consequences

- Any query written outside the data-access functions (raw SQL, scripts, a future background job) is not protected by the database and must filter by user ID itself.
- Reconsider RLS if the app opens to the public, if a second process starts querying user data, or if a cross-user leak is ever found.
