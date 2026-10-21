import { fileURLToPath } from 'node:url'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Pool } from 'pg'
import type { TestProject } from 'vitest/node'

// Brings the test database up to the committed migrations before any test
// file runs.
export default async function setup(project: TestProject) {
  const pool = new Pool({
    connectionString: project.config.env.DATABASE_URL,
  })
  try {
    await migrate(drizzle({ client: pool }), {
      migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)),
    })
  } finally {
    await pool.end()
  }
}
