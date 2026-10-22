import { CATEGORY_KINDS, type CategoryKind, STARTER_CATEGORIES } from '@for-wealth/shared'
import { and, asc, eq } from 'drizzle-orm'
import { db } from './db/client.js'
import { categories, users } from './db/schema/index.js'

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

// The user's Categories that aren't archived, in their order, one list per
// kind. A user with no Categories at all, which sign-up should never leave,
// gets the starter sets first. One who archived every Category doesn't.
export async function listCategories(userId: string) {
  let rows = await unarchivedCategories(userId)
  if (rows.length === 0) {
    await writeStarterCategories(userId)
    rows = await unarchivedCategories(userId)
  }

  const byKind: Record<CategoryKind, typeof rows> = { income: [], expense: [] }
  for (const row of rows) byKind[row.kind].push(row)
  return byKind
}

function unarchivedCategories(userId: string) {
  return db
    .select({ id: categories.id, name: categories.name, kind: categories.kind })
    .from(categories)
    .where(and(eq(categories.userId, userId), eq(categories.archived, false)))
    .orderBy(asc(categories.position), asc(categories.createdAt))
}
