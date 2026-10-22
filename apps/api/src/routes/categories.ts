import { Hono } from 'hono'
import { listCategories } from '../categories.js'
import { requireSession, type SignedInEnv } from '../require-session.js'

export const categories = new Hono<SignedInEnv>()
  .use(requireSession)
  .get('/', async (c) => c.json(await listCategories(c.get('user').id)))
