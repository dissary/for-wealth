import { defineConfig } from 'drizzle-kit'

// `pnpm db:generate` writes a migration from the schema; `pnpm db:migrate`
// applies the committed migrations to DATABASE_URL. Never `drizzle-kit push`.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema',
  out: './drizzle',
  casing: 'snake_case',
  // Empty when unset, which is fine for `generate`: it never connects.
  dbCredentials: { url: process.env.DATABASE_URL ?? '' },
})
