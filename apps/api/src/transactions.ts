import type { CalendarDate, CategoryKind, NewTransaction } from '@for-wealth/shared'
import { and, desc, eq } from 'drizzle-orm'
import { db } from './db/client.js'
import { categories, transactions } from './db/schema/index.js'

// Adds a Transaction for the user, or returns null when the Category isn't
// one of theirs: someone else's, archived, or no Category at all, which the
// route answers alike so nobody can probe for other users' IDs. The database
// refuses another user's Category too (transactions' foreign key).
export async function createTransaction(userId: string, input: NewTransaction) {
  const [category] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(
      and(eq(categories.userId, userId), eq(categories.id, input.categoryId), eq(categories.archived, false)),
    )
  if (!category) return null

  const [created] = await db
    .insert(transactions)
    .values({ userId, ...input })
    .returning({ id: transactions.id })
  return created!
}

// One day's Transactions, most recently added first, each with its
// Category's name and kind, and the day's Income and Expense totals.
export async function listDay(userId: string, date: CalendarDate) {
  const rows = await db
    .select({
      id: transactions.id,
      amount: transactions.amount,
      date: transactions.date,
      note: transactions.note,
      category: { id: categories.id, name: categories.name, kind: categories.kind },
    })
    .from(transactions)
    .innerJoin(
      categories,
      and(eq(categories.userId, transactions.userId), eq(categories.id, transactions.categoryId)),
    )
    .where(and(eq(transactions.userId, userId), eq(transactions.date, date)))
    .orderBy(desc(transactions.createdAt), desc(transactions.id))

  // Every Transaction in the Period is returned, so the totals are summed
  // from the same rows the list shows. The kind comes from the Category
  // (ADR 0005).
  const totals: Record<CategoryKind, number> = { income: 0, expense: 0 }
  for (const row of rows) totals[row.category.kind] += row.amount

  return { period: 'day' as const, date, totals, transactions: rows }
}
