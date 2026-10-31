import {
  type CalendarMonth,
  CATEGORY_KINDS,
  CATEGORY_LIMIT,
  type CategoryKind,
  type MoveDirection,
  type NewCategory,
  STARTER_CATEGORIES,
} from '@for-wealth/shared'
import { and, asc, count, eq, max, sql } from 'drizzle-orm'
import { endBudget } from './budgets.js'
import { db } from './db/client.js'
import { categories, users } from './db/schema/index.js'
import { activeUnder } from './recurring.js'

// Writes the starter sets for a user who has no Categories at all (archived
// included), and does nothing otherwise, so it is safe to run twice: sign-up
// and a first load can both call it, even at the same moment. The user's row
// is locked while checking, so two calls can't both find none and both write.
export async function writeStarterCategories(userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [user] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, userId))
      .for('no key update')
    if (!user) return

    const [existing] = await tx
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.userId, userId))
      .limit(1)
    if (existing) return

    await tx.insert(categories).values(
      CATEGORY_KINDS.flatMap((kind) =>
        STARTER_CATEGORIES[kind].map((name, position) => ({ userId, kind, name, position })),
      ),
    )
  })
}

// The user's Categories, one list per kind for those that aren't archived
// and the same for those that are, each in position order. A user with no
// Categories at all, which sign-up should never leave, gets the starter sets
// first. One who archived every Category doesn't.
export async function listCategories(userId: string) {
  let rows = await allCategories(userId)
  if (rows.length === 0) {
    await writeStarterCategories(userId)
    rows = await allCategories(userId)
  }

  const listed = { income: [] as Category[], expense: [] as Category[] }
  const archived = { income: [] as Category[], expense: [] as Category[] }
  for (const { archived: isArchived, ...category } of rows) {
    const lists = isArchived ? archived : listed
    lists[category.kind].push(category)
  }
  return { ...listed, archived }
}

interface Category {
  id: string
  name: string
  kind: CategoryKind
}

function allCategories(userId: string) {
  return db
    .select({ id: categories.id, name: categories.name, kind: categories.kind, archived: categories.archived })
    .from(categories)
    .where(eq(categories.userId, userId))
    .orderBy(asc(categories.position), asc(categories.createdAt), asc(categories.id))
}

// Adds a Category for the user, last in its kind. Says why when it can't:
// they already have the most of the kind that aren't archived, or one of
// theirs has the name.
export async function createCategory(userId: string, { name, kind }: NewCategory) {
  const add = () =>
    db.transaction(async (tx) => {
      // Locked, so two adds at the same moment can't both pass the limit or
      // take the same position.
      await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for('no key update')
      const ofKind = and(eq(categories.userId, userId), eq(categories.kind, kind))
      const [held] = await tx
        .select({ listed: count() })
        .from(categories)
        .where(and(ofKind, eq(categories.archived, false)))
      if (held!.listed >= CATEGORY_LIMIT) return { refused: 'limit' } as const

      const [last] = await tx.select({ position: max(categories.position) }).from(categories).where(ofKind)

      const [created] = await tx
        .insert(categories)
        .values({ userId, name, kind, position: (last?.position ?? -1) + 1 })
        .returning({ id: categories.id, name: categories.name, kind: categories.kind })
      return { created: created! }
    })
  return refusingNameClash(userId, kind, name, add)
}

// Renames one of the user's Categories that isn't archived. Changing only the
// capitals is a rename like any other. Says when it isn't theirs or is
// archived, or which of theirs already has the name.
export async function renameCategory(userId: string, id: string, name: string) {
  const usable = and(eq(categories.userId, userId), eq(categories.id, id), eq(categories.archived, false))
  const [current] = await db.select({ kind: categories.kind }).from(categories).where(usable)
  if (!current) return { notFound: true } as const

  const rename = async () => {
    const [renamed] = await db
      .update(categories)
      .set({ name })
      .where(usable)
      .returning({ id: categories.id, name: categories.name, kind: categories.kind })
    return renamed ? { renamed } : ({ notFound: true } as const)
  }
  return refusingNameClash(userId, current.kind, name, rename)
}

// Swaps one of the user's Categories that isn't archived with its neighbour
// in the same kind, among those that aren't archived. The first moved up or
// the last moved down stays where it is. False when it isn't theirs or is
// archived.
export async function moveCategory(userId: string, id: string, direction: MoveDirection) {
  return db.transaction(async (tx) => {
    // Locked, as for adding, so no other move or add touches the user's
    // Categories until this one is done: two quick presses each move once,
    // from the order the other left.
    await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for('no key update')
    const [moving] = await tx
      .select({ kind: categories.kind })
      .from(categories)
      .where(and(eq(categories.userId, userId), eq(categories.id, id), eq(categories.archived, false)))
    if (!moving) return false

    const listed = await tx
      .select({ id: categories.id, position: categories.position })
      .from(categories)
      .where(and(eq(categories.userId, userId), eq(categories.kind, moving.kind), eq(categories.archived, false)))
      .orderBy(asc(categories.position), asc(categories.createdAt), asc(categories.id))
    const from = listed.findIndex((category) => category.id === id)
    const to = direction === 'up' ? from - 1 : from + 1
    if (to < 0 || to >= listed.length) return true

    // Numbered afresh from 0, so positions that were ever equal can't keep
    // the swap from showing. Usually only the two swapped change.
    const order = listed.map((category) => category.id)
    order.splice(to, 0, ...order.splice(from, 1))
    const current = new Map(listed.map((category) => [category.id, category.position]))
    for (const [position, categoryId] of order.entries()) {
      if (current.get(categoryId) === position) continue
      await tx
        .update(categories)
        .set({ position })
        .where(and(eq(categories.userId, userId), eq(categories.id, categoryId)))
    }
    return true
  })
}

// Archives one of the user's Categories: it leaves every picker, and its
// Budget ends from `month`, this month in the user's time zone (v1-spec
// "Budgets"). Archiving one already archived changes nothing. Says why when
// it can't: it isn't theirs, it's the last of its kind that isn't archived,
// or Recurring Transactions that aren't stopped use it, which it names.
export async function archiveCategory(userId: string, id: string, month: CalendarMonth) {
  return db.transaction(async (tx) => {
    // Locked, as for adding, so two archives at the same moment can't both
    // pass the last of a kind, and a restore can't pass the limit meanwhile.
    await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for('no key update')
    // The Category's row too, before anything under it is read: a Recurring
    // Transaction or Budget being saved under it is either saved first, and
    // seen here, or waits and finds it archived.
    const [archiving] = await tx
      .select({ kind: categories.kind, archived: categories.archived })
      .from(categories)
      .where(and(eq(categories.userId, userId), eq(categories.id, id)))
      .for('no key update')
    if (!archiving) return { notFound: true } as const
    if (archiving.archived) return { archived: true } as const

    const [held] = await tx
      .select({ listed: count() })
      .from(categories)
      .where(and(eq(categories.userId, userId), eq(categories.kind, archiving.kind), eq(categories.archived, false)))
    if (held!.listed <= 1) return { refused: 'last', kind: archiving.kind } as const

    const recurring = await activeUnder(tx, userId, id)
    if (recurring.length > 0) return { refused: 'recurring', recurring } as const

    await tx
      .update(categories)
      .set({ archived: true })
      .where(and(eq(categories.userId, userId), eq(categories.id, id)))
    await endBudget(tx, userId, id, month)
    return { archived: true } as const
  })
}

// Restores one of the user's archived Categories, last in its kind. Its
// Budget doesn't come back. Restoring one that isn't archived changes
// nothing. Says why when it can't: it isn't theirs, or they already have the
// most of the kind that aren't archived.
export async function restoreCategory(userId: string, id: string) {
  return db.transaction(async (tx) => {
    // Locked, as for adding, so two restores at the same moment can't both
    // pass the limit or take the same position.
    await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for('no key update')
    const [restoring] = await tx
      .select({ kind: categories.kind, archived: categories.archived })
      .from(categories)
      .where(and(eq(categories.userId, userId), eq(categories.id, id)))
    if (!restoring) return { notFound: true } as const
    if (!restoring.archived) return { restored: true } as const

    const ofKind = and(eq(categories.userId, userId), eq(categories.kind, restoring.kind))
    const [held] = await tx
      .select({ listed: count() })
      .from(categories)
      .where(and(ofKind, eq(categories.archived, false)))
    if (held!.listed >= CATEGORY_LIMIT) return { refused: 'limit', kind: restoring.kind } as const

    const [last] = await tx.select({ position: max(categories.position) }).from(categories).where(ofKind)
    await tx
      .update(categories)
      .set({ archived: false, position: (last?.position ?? -1) + 1 })
      .where(and(eq(categories.userId, userId), eq(categories.id, id)))
    return { restored: true } as const
  })
}

// Runs a write that gives a Category this name, or, when the database refuses
// it because the user already has the name in the kind (archived ones
// included, ignoring case), says which Category has it.
async function refusingNameClash<T>(userId: string, kind: CategoryKind, name: string, write: () => Promise<T>) {
  try {
    return await write()
  } catch (error) {
    if (!isNameClash(error)) throw error
    const [taken] = await db
      .select({ name: categories.name, kind: categories.kind, archived: categories.archived })
      .from(categories)
      .where(
        and(
          eq(categories.userId, userId),
          eq(categories.kind, kind),
          eq(sql`lower(${categories.name})`, sql`lower(${name})`),
        ),
      )
    // Renamed or gone since the refusal: still a clash for this save.
    return { taken: taken ?? { name, kind, archived: false } }
  }
}

// Drizzle wraps the driver's error, which names the constraint.
function isNameClash(error: unknown) {
  return (
    error instanceof Error &&
    (error.cause as { constraint?: unknown } | undefined)?.constraint === 'categories_user_id_kind_name_unique'
  )
}
