import {
  CATEGORY_LIMIT,
  type CategoryKind,
  categoryChangesSchema,
  monthOf,
  moveCategorySchema,
  newCategorySchema,
  todayIn,
} from '@for-wealth/shared'
import { type Context, Hono } from 'hono'
import { validator } from 'hono/validator'
import { z } from 'zod'
import {
  archiveCategory,
  createCategory,
  listCategories,
  moveCategory,
  renameCategory,
  restoreCategory,
} from '../categories.js'
import { parseFor } from '../parse-for.js'
import { requireSession, type SignedInEnv } from '../require-session.js'
import { limitWrites } from '../write-limit.js'
import { categoryNotFound } from './shared.js'

const KIND_LABELS: Record<CategoryKind, string> = { income: 'Income', expense: 'Expense' }

// The user already has a Category of this kind with the name, ignoring case.
// When it's archived, restoring it is the way to get it back.
function nameTaken(c: Context, taken: { name: string; kind: CategoryKind; archived: boolean }) {
  const message = taken.archived
    ? `You have an archived Category called ${taken.name}. Restore it instead.`
    : `You already have an ${KIND_LABELS[taken.kind]} Category called ${taken.name}.`
  return c.json({ code: 'CATEGORY_NAME_TAKEN' as const, message }, 409)
}

// The most that aren't archived are already there for the kind.
function categoryLimit(c: Context, kind: CategoryKind) {
  const message = `You can have up to ${CATEGORY_LIMIT} ${KIND_LABELS[kind]} Categories.`
  return c.json({ code: 'CATEGORY_LIMIT' as const, message }, 409)
}

// A Category's ID in the path. One that isn't an ID can't be anyone's, so it
// gets the same 404 as one that doesn't exist.
const idParam = validator('param', (value, c) => {
  const parsed = z.object({ id: z.uuid() }).safeParse(value)
  if (!parsed.success) return categoryNotFound(c)
  return parsed.data
})

export const categories = new Hono<SignedInEnv>()
  .use(requireSession)
  .use(limitWrites)
  .get('/', async (c) => c.json(await listCategories(c.get('user').id)))
  .post('/', validator('json', parseFor(() => newCategorySchema)), async (c) => {
    const input = c.req.valid('json')
    const result = await createCategory(c.get('user').id, input)
    if ('taken' in result) return nameTaken(c, result.taken)
    if ('refused' in result) return categoryLimit(c, input.kind)
    return c.json(result.created, 201)
  })
  .patch('/:id', idParam, validator('json', parseFor(() => categoryChangesSchema)), async (c) => {
    const result = await renameCategory(c.get('user').id, c.req.valid('param').id, c.req.valid('json').name)
    if ('renamed' in result) return c.json(result.renamed, 200)
    if ('taken' in result) return nameTaken(c, result.taken)
    return categoryNotFound(c)
  })
  .post('/:id/move', idParam, validator('json', parseFor(() => moveCategorySchema)), async (c) => {
    const { id } = c.req.valid('param')
    const moved = await moveCategory(c.get('user').id, id, c.req.valid('json').direction)
    if (!moved) return categoryNotFound(c)
    return c.body(null, 204)
  })
  .post('/:id/archive', idParam, async (c) => {
    const user = c.get('user')
    const result = await archiveCategory(user.id, c.req.valid('param').id, monthOf(todayIn(user.timeZone)))
    if ('notFound' in result) return categoryNotFound(c)
    if (result.refused === 'last') {
      const message = `This is your last ${KIND_LABELS[result.kind]} Category. Add another before archiving it.`
      return c.json({ code: 'LAST_CATEGORY' as const, message }, 409)
    }
    if (result.refused === 'recurring') {
      // Named, so Settings can list them to move to another Category or stop.
      const message =
        'Recurring Transactions use this Category. Move them to another Category or stop them first.'
      return c.json({ code: 'CATEGORY_HAS_RECURRING' as const, message, recurring: result.recurring }, 409)
    }
    return c.body(null, 204)
  })
  .post('/:id/restore', idParam, async (c) => {
    const result = await restoreCategory(c.get('user').id, c.req.valid('param').id)
    if ('notFound' in result) return categoryNotFound(c)
    if (result.refused === 'limit') return categoryLimit(c, result.kind)
    return c.body(null, 204)
  })
