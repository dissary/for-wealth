import {
  type BudgetChange,
  type BudgetLimits,
  type CalendarMonth,
  firstDayOf,
  limitIn,
  monthOf,
  savingLimit,
} from '@for-wealth/shared'
import { and, asc, eq, gt, inArray, lte } from 'drizzle-orm'
import { db } from './db/client.js'
import { budgets, categories } from './db/schema/index.js'

// Where Budgets can be set: the user's Expense Categories that aren't
// archived. Archiving one ends its Budget from that month (archiveCategory).
function budgetable(userId: string) {
  return and(eq(categories.userId, userId), eq(categories.kind, 'expense'), eq(categories.archived, false))
}

// The user's changes to their Budgets, one list per Category, narrowed
// further by `condition`.
async function changesByCategory(
  tx: Pick<typeof db, 'select'>,
  userId: string,
  condition?: ReturnType<typeof and>,
) {
  const rows = await tx
    .select({ categoryId: budgets.categoryId, month: budgets.month, limit: budgets.limit })
    .from(budgets)
    .where(and(eq(budgets.userId, userId), condition))

  const byCategory = new Map<string, BudgetChange[]>()
  for (const { categoryId, month, limit } of rows) {
    const changes = byCategory.get(categoryId) ?? []
    changes.push({ month: monthOf(month), limit })
    byCategory.set(categoryId, changes)
  }
  return byCategory
}

// Every Expense Category that isn't archived, in position order, with the
// month's limit, for Edit Budgets.
export async function monthBudgets(userId: string, month: CalendarMonth) {
  const rows = await db
    .select({ id: categories.id, name: categories.name })
    .from(categories)
    .where(budgetable(userId))
    .orderBy(asc(categories.position), asc(categories.createdAt))
  return withLimits(userId, month, rows)
}

// Every Expense Category, archived ones included, in position order, with the
// month's limit, for the Dashboard: an archived Category keeps the limits it
// had in the months before it was archived (v1-spec "Budgets").
export async function monthBudgetsWithArchived(userId: string, month: CalendarMonth) {
  const rows = await db
    .select({ id: categories.id, name: categories.name, archived: categories.archived })
    .from(categories)
    .where(and(eq(categories.userId, userId), eq(categories.kind, 'expense')))
    .orderBy(asc(categories.position), asc(categories.createdAt))
  return withLimits(userId, month, rows)
}

// Each Category with the month's limit: the latest change at or before it,
// or null for no limit (ADR 0007).
async function withLimits<T extends { id: string }>(userId: string, month: CalendarMonth, rows: T[]) {
  // Later changes can't reach this month, so they aren't read.
  const changes = await changesByCategory(db, userId, lte(budgets.month, firstDayOf(month)))
  return rows.map((category) => ({ category, limit: limitIn(changes.get(category.id) ?? [], month) }))
}

// Sets each Category's limit from `month` on, all in one transaction, so
// either every limit is saved or none is. Earlier months never change.
// Each ID must be an ID; the route checks. Returns false, saving nothing,
// when a Category isn't one Budgets can be set for: someone else's,
// archived, an Income Category, or no Category at all, which the route
// answers alike so nobody can probe for other users' IDs. Whichever save
// comes last wins.
export async function setBudgets(userId: string, month: CalendarMonth, { limits }: BudgetLimits) {
  const ids = limits.map((l) => l.categoryId)
  if (ids.length === 0) return true

  return db.transaction(async (tx) => {
    // Locked, so two saves for the same Category can't both decide from the
    // changes they read and then both write.
    const found = await tx
      .select({ id: categories.id })
      .from(categories)
      .where(and(budgetable(userId), inArray(categories.id, ids)))
      .for('no key update')
    if (found.length !== ids.length) return false

    const changes = await changesByCategory(tx, userId, inArray(budgets.categoryId, ids))
    for (const { categoryId, limit } of limits) {
      await saveLimit(tx, userId, categoryId, month, changes.get(categoryId) ?? [], limit)
    }
    return true
  })
}

// Inside one of db.transaction's callbacks.
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

// Ends a Category's Budget from `month`, inside the transaction that archives
// it: later changes are removed and the month gets no limit. Earlier months
// keep their limits, as that is what was really planned (v1-spec "Budgets").
export async function endBudget(tx: Transaction, userId: string, categoryId: string, month: CalendarMonth) {
  const ofCategory = and(eq(budgets.userId, userId), eq(budgets.categoryId, categoryId))
  await tx.delete(budgets).where(and(ofCategory, gt(budgets.month, firstDayOf(month))))
  const changes = await changesByCategory(tx, userId, eq(budgets.categoryId, categoryId))
  await saveLimit(tx, userId, categoryId, month, changes.get(categoryId) ?? [], null)
}

// Gives one Category `limit` from `month` on, given its stored changes, the
// way savingLimit says: a change of its own for the month, or none when the
// month would carry the limit in anyway.
async function saveLimit(
  tx: Transaction,
  userId: string,
  categoryId: string,
  month: CalendarMonth,
  changes: readonly BudgetChange[],
  limit: number | null,
) {
  const from = firstDayOf(month)
  switch (savingLimit(changes, month, limit)) {
    case 'store':
      await tx
        .insert(budgets)
        .values({ userId, categoryId, month: from, limit })
        .onConflictDoUpdate({ target: [budgets.userId, budgets.categoryId, budgets.month], set: { limit } })
      break
    case 'drop':
      await tx
        .delete(budgets)
        .where(and(eq(budgets.userId, userId), eq(budgets.categoryId, categoryId), eq(budgets.month, from)))
      break
    case 'nothing':
      break
  }
}
