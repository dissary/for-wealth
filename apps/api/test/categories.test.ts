import { and, eq, sql } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, pool } from '../src/db/client.js'
import { type listCategories, writeStarterCategories } from '../src/categories.js'
import { categories, users } from '../src/db/schema/index.js'
import { responseFloor } from '../src/response-floor.js'
import {
  cookiesFrom,
  getCategories,
  getMe,
  NEW_USER,
  OTHER_USER,
  signIn,
  signInNewUser,
  signUp,
  startFresh,
} from './helpers.js'

const INCOME = ['Salary', 'Bonus', 'Side income', 'Other']
const EXPENSE = [
  'Food',
  'Transport',
  'Housing',
  'Utilities',
  'Bills & Subscriptions',
  'Shopping',
  'Health',
  'Entertainment',
  'Family',
  'Other',
]

async function categoriesFor(cookie: string) {
  const res = await getCategories(cookie)
  expect(res.status).toBe(200)
  return (await res.json()) as Awaited<ReturnType<typeof listCategories>>
}

async function namesFor(cookie: string) {
  const { income, expense } = await categoriesFor(cookie)
  return { income: income.map((c) => c.name), expense: expense.map((c) => c.name) }
}

beforeEach(async () => {
  await startFresh()
})
afterAll(() => pool.end())

describe('GET /api/categories', () => {
  it('gives a new user exactly the starter sets, in order', async () => {
    const cookie = await signInNewUser()

    expect(await namesFor(cookie)).toEqual({ income: INCOME, expense: EXPENSE })
  })

  it('is refused without a session', async () => {
    const res = await getCategories()

    expect(res.status).toBe(401)
  })

  it('writes the starter sets again for a user with no Categories at all', async () => {
    const cookie = await signInNewUser()
    await db.delete(categories)

    expect(await namesFor(cookie)).toEqual({ income: INCOME, expense: EXPENSE })
  })

  it('leaves out archived Categories', async () => {
    const cookie = await signInNewUser()
    await db.update(categories).set({ archived: true }).where(eq(categories.name, 'Bonus'))

    expect((await namesFor(cookie)).income).toEqual(['Salary', 'Side income', 'Other'])
  })

  it("doesn't bring the starter sets back for a user who archived every Category", async () => {
    const cookie = await signInNewUser()
    await db.update(categories).set({ archived: true })

    expect(await namesFor(cookie)).toEqual({ income: [], expense: [] })
    expect(await db.$count(categories)).toBe(INCOME.length + EXPENSE.length)
  })

  it('shows each of two users only their own Categories', async () => {
    const aisyah = await signInNewUser(NEW_USER)
    const weiMing = await signInNewUser(OTHER_USER)
    await db
      .update(categories)
      .set({ name: 'Aisyah’s salary' })
      .where(
        and(
          eq(categories.name, 'Salary'),
          eq(
            categories.userId,
            db.select({ id: users.id }).from(users).where(eq(users.email, NEW_USER.email)),
          ),
        ),
      )

    const [forAisyah, forWeiMing] = await Promise.all([aisyah, weiMing].map(categoriesFor))

    expect(forAisyah!.income.map((c) => c.name)).toEqual(['Aisyah’s salary', 'Bonus', 'Side income', 'Other'])
    expect(forWeiMing!.income.map((c) => c.name)).toEqual(INCOME)
    const aisyahIds = [...forAisyah!.income, ...forAisyah!.expense].map((c) => c.id)
    const weiMingIds = [...forWeiMing!.income, ...forWeiMing!.expense].map((c) => c.id)
    expect(aisyahIds.filter((id) => weiMingIds.includes(id))).toEqual([])
  })

  it('tells caches not to keep the answer', async () => {
    const cookie = await signInNewUser()

    const res = await getCategories(cookie)

    expect(res.headers.get('cache-control')).toBe('no-store')
  })
})

describe('writeStarterCategories', () => {
  // Sign-up and a first load can both call it, possibly at the same moment.
  // Several rounds, as a race without the lock doesn't show every time.
  it('writes the starter sets once, however many calls run at the same time', async () => {
    const cookie = await signInNewUser()
    const { id } = (await (await getMe(cookie)).json()) as { id: string }

    for (let round = 1; round <= 5; round++) {
      await db.delete(categories)
      await Promise.all(Array.from({ length: 8 }, () => writeStarterCategories(id)))

      expect(await db.$count(categories), `round ${round}`).toBe(INCOME.length + EXPENSE.length)
    }
  })
})

describe('signing up', () => {
  // Checked in the database: no request has loaded the Categories yet, so
  // the load's backstop hasn't run.
  it('writes the starter sets for the new user', async () => {
    await signUp(NEW_USER)

    const written = await db
      .select({ name: categories.name })
      .from(categories)
      .innerJoin(users, eq(users.id, categories.userId))
      .where(eq(users.email, NEW_USER.email))
    expect(written).toHaveLength(INCOME.length + EXPENSE.length)
  })

  // A new email also writes the starter sets, which a known email doesn't.
  // Both must still finish under the real floor, so neither takes longer.
  it('still takes the same time for a new and a known email', async () => {
    responseFloor.minimumMs = 1000
    const durations: number[] = []

    for (const attempt of ['new email', 'same email again']) {
      const start = performance.now()
      const res = await signUp(NEW_USER)
      durations.push(performance.now() - start)
      expect(res.status, attempt).toBe(200)
    }

    for (const duration of durations) {
      expect(duration).toBeGreaterThanOrEqual(1000)
      expect(duration).toBeLessThan(1100)
    }
  })

  // An error only for a new email would show which emails have accounts.
  it('answers as usual when the starter sets fail, and the first load writes them', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await refuseCategoryWrites(() => signUp(NEW_USER))
    await db.update(users).set({ emailVerified: true }).where(eq(users.email, NEW_USER.email))
    const cookie = cookiesFrom(await signIn(NEW_USER))

    expect(res.status).toBe(200)
    expect(logged).toHaveBeenCalled()
    expect(await namesFor(cookie)).toEqual({ income: INCOME, expense: EXPENSE })
  })
})

// Runs `during` while a trigger makes Postgres reject any new Category.
async function refuseCategoryWrites<T>(during: () => T | Promise<T>) {
  await db.execute(sql`
    create function refuse_category_write() returns trigger language plpgsql as $$
    begin raise exception 'category writes refused by the test'; end $$
  `)
  await db.execute(sql`
    create trigger refuse_category_write before insert on categories
    for each row execute function refuse_category_write()
  `)
  try {
    return await during()
  } finally {
    await db.execute(sql`drop trigger refuse_category_write on categories`)
    await db.execute(sql`drop function refuse_category_write`)
  }
}
