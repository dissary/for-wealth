import { MAX_AMOUNT, NOTE_MAX_LENGTH } from '@for-wealth/shared'
import { sql } from 'drizzle-orm'
import { bigint, check, date, foreignKey, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { users } from './auth.js'
import { categories } from './categories.js'

export const transactions = pgTable(
  'transactions',
  {
    id: uuid().default(sql`pg_catalog.gen_random_uuid()`).primaryKey(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // Income or an Expense because of this Category; there's no type column
    // and no sign on the amount (ADR 0005).
    categoryId: uuid().notNull(),
    // Minor units (sen for MYR), always positive. Up to 10^11, well inside
    // what a JavaScript number holds exactly.
    amount: bigint({ mode: 'number' }).notNull(),
    // A calendar date in the user's time zone, with no time.
    date: date({ mode: 'string' }).notNull(),
    note: text(),
    // Orders Transactions within a day, most recently added first.
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    // Covers user_id as well as category_id, so the database itself refuses a
    // Transaction filed under another user's Category (v1-spec "Data and
    // security"). No cascade: Categories are archived, not deleted, and
    // deleting the user removes both in the same statement.
    foreignKey({
      name: 'transactions_user_id_category_id_categories_fk',
      columns: [table.userId, table.categoryId],
      foreignColumns: [categories.userId, categories.id],
    }),
    // The API checks these first; the database holds the line if it doesn't.
    check('transactions_amount_range', sql`${table.amount} between 1 and ${sql.raw(String(MAX_AMOUNT))}`),
    check('transactions_date_from_2000', sql`${table.date} >= '2000-01-01'`),
    check('transactions_note_length', sql`char_length(${table.note}) <= ${sql.raw(String(NOTE_MAX_LENGTH))}`),
    // Every read takes one user's Transactions over a run of dates.
    index('transactions_user_id_date_index').on(table.userId, table.date),
  ],
)
