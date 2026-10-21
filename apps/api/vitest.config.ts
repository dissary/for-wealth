import { defineConfig } from 'vitest/config'

// Integration tests run against for_wealth_test, never the dev database.
// CI can point at another server with TEST_DATABASE_URL.
const databaseUrl =
  process.env.TEST_DATABASE_URL ??
  'postgres://for_wealth:for_wealth@localhost:5432/for_wealth_test'

const databaseName = new URL(databaseUrl).pathname.slice(1)
if (!databaseName.endsWith('_test')) {
  throw new Error(
    `Refusing to run tests against "${databaseName}": the database name must end in _test`,
  )
}

export default defineConfig({
  test: {
    env: {
      DATABASE_URL: databaseUrl,
      BETTER_AUTH_SECRET: 'test-only-secret-not-used-anywhere-else',
      BETTER_AUTH_URL: 'http://localhost:5173',
    },
    globalSetup: ['./test/global-setup.ts'],
    setupFiles: ['./test/no-network.ts'],
    // The tests share one database, so test files run one at a time.
    fileParallelism: false,
  },
})
