import { CATEGORY_KINDS } from '@for-wealth/shared'
import { sql } from 'drizzle-orm'
import { boolean, integer, pgEnum, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'
import { users } from './auth.js'

export const categoryKind = pgEnum('category_kind', CATEGORY_KINDS)

export const categories = pgTable(
  'categories',
  {
    id: uuid().default(sql`pg_catalog.gen_random_uuid()`).primaryKey(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    // Fixed once created: changing it would turn every past Transaction under
    // the Category from Income into an Expense, or back (ADR 0005).
    kind: categoryKind().notNull(),
    // Order within the kind, smallest first.
    position: integer().notNull(),
    // Archived instead of deleted, so past Transactions keep their Category.
    archived: boolean().notNull().default(false),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  // Lets a Transaction's foreign key cover (user_id, category_id), so the
  // database refuses a Transaction filed under another user's Category. It
  // also serves every lookup by user.
  (table) => [unique('categories_user_id_id_unique').on(table.userId, table.id)],
)
