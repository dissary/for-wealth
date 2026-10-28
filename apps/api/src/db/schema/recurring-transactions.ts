import { FREQUENCIES, MAX_AMOUNT, NOTE_MAX_LENGTH } from '@for-wealth/shared'
import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'
import { users } from './auth.js'
import { categories } from './categories.js'

export const frequency = pgEnum('frequency', FREQUENCIES)

// A template that creates a Transaction on each Due Date of its schedule.
// Stopped instead of deleted, so the Transactions it created keep their link
// (ADR 0009).
export const recurringTransactions = pgTable(
  'recurring_transactions',
  {
    id: uuid().default(sql`pg_catalog.gen_random_uuid()`).primaryKey(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    categoryId: uuid().notNull(),
    // Minor units, under a Transaction amount's bounds. When the amount
    // varies, it's the guess each Estimate starts on.
    amount: bigint({ mode: 'number' }).notNull(),
    note: text(),
    varies: boolean().notNull(),
    // Monthly on `day`, weekly on `weekday` (1 for Monday to 7 for Sunday),
    // or yearly on `day` of `month`. The others are null.
    frequency: frequency().notNull(),
    day: integer(),
    weekday: integer(),
    month: integer(),
    startDate: date({ mode: 'string' }).notNull(),
    // Moves on as Transactions are created, which is how a deleted one is
    // never created again (ADR 0008).
    nextDueDate: date({ mode: 'string' }).notNull(),
    // Null until the first Transaction is created.
    lastDueDate: date({ mode: 'string' }),
    stoppedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    // Covers user_id as well as category_id, so the database itself refuses
    // one under another user's Category, as for a Transaction.
    foreignKey({
      name: 'recurring_transactions_user_id_category_id_categories_fk',
      columns: [table.userId, table.categoryId],
      foreignColumns: [categories.userId, categories.id],
    }),
    // Lets a Transaction's link cover (user_id, recurring_transaction_id), so
    // the database refuses a link to another user's. It also serves every
    // lookup by user.
    unique('recurring_transactions_user_id_id_unique').on(table.userId, table.id),
    // The API checks these first; the database holds the line if it doesn't.
    check('recurring_transactions_amount_range', sql`${table.amount} between 1 and ${sql.raw(String(MAX_AMOUNT))}`),
    check(
      'recurring_transactions_note_length',
      sql`char_length(${table.note}) <= ${sql.raw(String(NOTE_MAX_LENGTH))}`,
    ),
    check(
      'recurring_transactions_schedule',
      // Coalesced, as a null (a missing day, say) would otherwise pass.
      sql`coalesce(case ${table.frequency}
        when 'monthly' then ${table.day} between 1 and 31 and ${table.weekday} is null and ${table.month} is null
        when 'weekly' then ${table.weekday} between 1 and 7 and ${table.day} is null and ${table.month} is null
        when 'yearly' then ${table.month} between 1 and 12 and ${table.day} between 1 and 31 and ${table.weekday} is null
      end, false)`,
    ),
    check('recurring_transactions_start_date_from_2000', sql`${table.startDate} >= '2000-01-01'`),
    check('recurring_transactions_next_due_date_from_start', sql`${table.nextDueDate} >= ${table.startDate}`),
    check(
      'recurring_transactions_last_due_date_before_next',
      sql`${table.lastDueDate} is null or ${table.lastDueDate} < ${table.nextDueDate}`,
    ),
  ],
)
