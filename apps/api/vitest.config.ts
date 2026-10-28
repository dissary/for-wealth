import { existsSync, readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import { defineConfig } from 'vitest/config'

// Integration tests run against a database whose name ends in _test, never
// the dev database. TEST_DATABASE_URL comes from the environment (CI sets it)
// or from apps/api/.env.
const envFile = new URL('./.env', import.meta.url)
const fileEnv = existsSync(envFile) ? parseEnv(readFileSync(envFile, 'utf8')) : {}
const databaseUrl = process.env.TEST_DATABASE_URL ?? fileEnv.TEST_DATABASE_URL

if (!databaseUrl) {
  throw new Error('Set TEST_DATABASE_URL in apps/api/.env (see .env.example)')
}

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
    setupFiles: ['./test/no-network.ts', './test/fast-passwords.ts'],
    // The tests share one database, so test files run one at a time.
    fileParallelism: false,
  },
})
