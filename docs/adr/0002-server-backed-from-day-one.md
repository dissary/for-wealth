# Data lives on our own API from day one, not in the browser

All data is stored in PostgreSQL behind our own API with user login, even though the first user is the author. We rejected browser-only storage (IndexedDB) because the app will be shared with friends soon after the foundation is built, and migrating data out of each person's browser later is harder than building login now. We rejected a hosted backend (Supabase, Firebase) in favour of owning the API.

## Consequences

- Every table that holds user data is scoped to a user from the first migration, and every query filters by it.
