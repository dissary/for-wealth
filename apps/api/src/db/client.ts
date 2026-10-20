import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { env } from '../env.js'
import * as schema from './schema/index.js'

export const pool = new Pool({ connectionString: env.DATABASE_URL })

// Same casing as drizzle.config.ts: TypeScript keys, snake_case columns.
export const db = drizzle({ client: pool, schema, casing: 'snake_case' })

export type Db = typeof db
