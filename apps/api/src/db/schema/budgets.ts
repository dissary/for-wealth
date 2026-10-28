import { MAX_AMOUNT } from '@for-wealth/shared'
import { sql } from 'drizzle-orm'
import { bigint, check, date, foreignKey, pgTable, timestamp, unique, uuid } from 'drizzle-orm/pg-core'
import { users } from './auth.js'
import { categories } from './categories.js'

// Each row is one change to an Expense Category's Budget: from `month` on,
// its limit is `limit`, or there is none. A month's limit is the latest
// change at or before it; nothing is stored per month (ADR 0007).
export const budgets = pgTable(
  'budgets',
  {
    id: uuid().default(sql`pg_catalog.gen_random_uuid()`).primaryKey(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    categoryId: uuid().notNull(),
    // The first day of the month the change starts from.
    month: date({ mode: 'string' }).notNull(),
    // Minor units, under a Transaction amount's bounds. Null removes the
    // limit from this month on.
    limit: bigint({ mode: 'number' }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    // Covers user_id as well as category_id, so the database itself refuses a
    // Budget on another user's Category, as for a Transaction. No cascade:
    // Categories are archived, not deleted.
    foreignKey({
      name: 'budgets_user_id_category_id_categories_fk',
      columns: [table.userId, table.categoryId],
      foreignColumns: [categories.userId, categories.id],
    }),
    // At most one change per Category per month. It also serves every read,
    // which takes one user's changes.
    unique('budgets_user_id_category_id_month_unique').on(table.userId, table.categoryId, table.month),
    // The API checks these first; the database holds the line if it doesn't.
    check('budgets_limit_range', sql`${table.limit} between 1 and ${sql.raw(String(MAX_AMOUNT))}`),
    check('budgets_month_first_day', sql`extract(day from ${table.month}) = 1`),
    check('budgets_month_from_2000', sql`${table.month} >= '2000-01-01'`),
  ],
)
