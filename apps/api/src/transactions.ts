import {
  type CalendarDate,
  type CategoryKind,
  type NewTransaction,
  type Period,
  periodRange,
  type TransactionChanges,
} from '@for-wealth/shared'
import { and, between, desc, eq, type SQL } from 'drizzle-orm'
import { db } from './db/client.js'
import { categories, transactions } from './db/schema/index.js'

// Adds a Transaction for the user, or returns null when the Category isn't
// one of theirs: someone else's, archived, or no Category at all, which the
// route answers alike so nobody can probe for other users' IDs. The database
// refuses another user's Category too (transactions' foreign key).
export async function createTransaction(userId: string, input: NewTransaction) {
  if (!(await canFileUnder(userId, input.categoryId))) return null

  const [created] = await db
    .insert(transactions)
    .values({ userId, ...input })
    .returning({ id: transactions.id })
  return created!
}

// Whether new Transactions can go under this Category: it must be one of
// the user's and not archived, as archived ones are hidden from pickers.
async function canFileUnder(userId: string, categoryId: string) {
  const [category] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.userId, userId), eq(categories.id, categoryId), eq(categories.archived, false)))
  return !!category
}

// A Transaction as the API shows it: with its Category's name and kind,
// which say whether it is Income or an Expense (ADR 0005). Only the user's
// own, narrowed further by `conditions`.
function selectTransactions(userId: string, ...conditions: (SQL | undefined)[]) {
  return db
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
    .where(and(eq(transactions.userId, userId), ...conditions))
}

// One of the user's Transactions, or null when it isn't theirs or doesn't
// exist, which the route answers alike.
export async function findTransaction(userId: string, id: string) {
  const [found] = await selectTransactions(userId, eq(transactions.id, id))
  return found ?? null
}

// Changes the fields given, under the same rules as adding: a new Category
// must be one of the user's that isn't archived. Keeping the Category it has
// is always allowed, archived or not, so an old Transaction can still be
// edited. Whichever save comes last wins. Says which wasn't found when the
// Transaction or the new Category isn't the user's.
export async function updateTransaction(userId: string, id: string, changes: TransactionChanges) {
  const [current] = await db
    .select({ categoryId: transactions.categoryId })
    .from(transactions)
    .where(and(eq(transactions.userId, userId), eq(transactions.id, id)))
  if (!current) return { notFound: 'transaction' } as const

  if (
    changes.categoryId !== undefined &&
    changes.categoryId !== current.categoryId &&
    !(await canFileUnder(userId, changes.categoryId))
  ) {
    return { notFound: 'category' } as const
  }

  if (Object.keys(changes).length > 0) {
    await db
      .update(transactions)
      .set(changes)
      .where(and(eq(transactions.userId, userId), eq(transactions.id, id)))
  }
  // Null if it was deleted in the meantime.
  const updated = await findTransaction(userId, id)
  return updated ? { updated } : ({ notFound: 'transaction' } as const)
}

// Deletes one of the user's Transactions for good: no soft delete, no undo.
// False when it isn't theirs or doesn't exist.
export async function deleteTransaction(userId: string, id: string) {
  const deleted = await db
    .delete(transactions)
    .where(and(eq(transactions.userId, userId), eq(transactions.id, id)))
    .returning({ id: transactions.id })
  return deleted.length > 0
}

// Every Transaction in the Period holding `date`, newest date first and most
// recently added first within a day, each with its Category's name and kind,
// and the Period's Income and Expense totals. There's no paging: a Period is
// at most a month of one person's spending.
//
// With a Category, the list and totals cover only that Category. Returns null
// when it isn't one of the user's, answered alike for someone else's and one
// that doesn't exist. An archived Category is still theirs, and old
// Transactions keep it, so it can still be browsed.
export async function listPeriod(
  userId: string,
  query: { period: Period; date: CalendarDate; category?: string | undefined },
) {
  const { period, date } = query
  let category = null
  if (query.category) {
    ;[category] = await db
      .select({ id: categories.id, name: categories.name, kind: categories.kind })
      .from(categories)
      .where(and(eq(categories.userId, userId), eq(categories.id, query.category)))
    if (!category) return null
  }

  const { from, to } = periodRange(period, date)
  const rows = await selectTransactions(
    userId,
    between(transactions.date, from, to),
    category ? eq(transactions.categoryId, category.id) : undefined,
  ).orderBy(desc(transactions.date), desc(transactions.createdAt), desc(transactions.id))

  // Every Transaction in the Period is returned, so the totals are summed
  // from the same rows the list shows. The kind comes from the Category
  // (ADR 0005).
  const totals: Record<CategoryKind, number> = { income: 0, expense: 0 }
  for (const row of rows) totals[row.category.kind] += row.amount

  return { period, date, category, totals, transactions: rows }
}
