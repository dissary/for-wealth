import { addMonths, firstDayOf, monthOf, todayIn } from '@for-wealth/shared'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, pool } from '../src/db/client.js'
import { type listCategories, writeStarterCategories } from '../src/categories.js'
import { budgets, categories, transactions, users } from '../src/db/schema/index.js'
import { responseFloor } from '../src/response-floor.js'
import { writeLimit } from '../src/write-limit.js'
import {
  archiveCategory,
  cookiesFrom,
  getBudgets,
  getCategories,
  getDashboard,
  getMe,
  moveCategory,
  NEW_USER,
  OTHER_USER,
  patchCategory,
  postCategory,
  postRecurring,
  putBudgets,
  restoreCategory,
  signIn,
  signInNewUser,
  signUp,
  startFresh,
  stopRecurring,
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

  it('lists archived Categories apart, by kind, in position order', async () => {
    const cookie = await signInNewUser()
    await db.update(categories).set({ archived: true }).where(inArray(categories.name, ['Health', 'Bonus', 'Food']))

    const { archived } = await categoriesFor(cookie)

    expect(archived.income.map((c) => c.name)).toEqual(['Bonus'])
    expect(archived.expense.map((c) => c.name)).toEqual(['Food', 'Health'])
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

// The ID of the user's Category with this name and kind, archived or not.
async function idOf(cookie: string, kind: 'income' | 'expense', name: string) {
  const listed = await categoriesFor(cookie)
  const found = [...listed[kind], ...listed.archived[kind]].find((c) => c.name === name)
  if (!found) throw new Error(`No ${kind} Category called ${name}`)
  return found.id
}

// Writes Expense Categories "Extra 1" onwards straight to the database, after
// the user's own.
async function addExpenseCategories(cookie: string, howMany: number) {
  const { id: userId } = (await (await getMe(cookie)).json()) as { id: string }
  await db.insert(categories).values(
    Array.from({ length: howMany }, (_, i) => ({
      userId,
      name: `Extra ${i + 1}`,
      kind: 'expense' as const,
      position: 100 + i,
    })),
  )
}

describe('POST /api/categories', () => {
  it('adds a Category last in its kind', async () => {
    const cookie = await signInNewUser()

    const res = await postCategory(cookie, { name: 'Pets', kind: 'expense' })

    expect(res.status).toBe(201)
    const created = (await res.json()) as { id: string; name: string; kind: string }
    expect(created).toEqual({ id: expect.any(String), name: 'Pets', kind: 'expense' })
    expect(await namesFor(cookie)).toEqual({ income: INCOME, expense: [...EXPENSE, 'Pets'] })
    expect(await idOf(cookie, 'expense', 'Pets')).toBe(created.id)
  })

  it('trims the name', async () => {
    const cookie = await signInNewUser()

    const res = await postCategory(cookie, { name: '  Pets  ', kind: 'expense' })

    expect(res.status).toBe(201)
    expect((await namesFor(cookie)).expense.at(-1)).toBe('Pets')
  })

  it.each([
    ['an empty name', { name: '', kind: 'expense' }, 'name'],
    ['a blank name', { name: '   ', kind: 'expense' }, 'name'],
    ['a name over 40 characters', { name: 'x'.repeat(41), kind: 'expense' }, 'name'],
    ['no kind', { name: 'Pets' }, 'kind'],
    ['an unknown kind', { name: 'Pets', kind: 'transfer' }, 'kind'],
  ])('refuses %s', async (_, body, field) => {
    const cookie = await signInNewUser()

    const res = await postCategory(cookie, body)

    expect(res.status).toBe(400)
    const { code, fields } = (await res.json()) as { code: string; fields: Record<string, unknown> }
    expect(code).toBe('INVALID_INPUT')
    expect(Object.keys(fields)).toEqual([field])
    expect(await namesFor(cookie)).toEqual({ income: INCOME, expense: EXPENSE })
  })

  it('refuses a name already used in the same kind, ignoring case', async () => {
    const cookie = await signInNewUser()

    const res = await postCategory(cookie, { name: ' fOOD ', kind: 'expense' })

    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({
      code: 'CATEGORY_NAME_TAKEN',
      message: 'You already have an Expense Category called Food.',
    })
    expect(await namesFor(cookie)).toEqual({ income: INCOME, expense: EXPENSE })
  })

  it('says to restore an archived Category with the same name', async () => {
    const cookie = await signInNewUser()
    await db.update(categories).set({ archived: true }).where(eq(categories.name, 'Food'))

    const res = await postCategory(cookie, { name: 'food', kind: 'expense' })

    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({
      code: 'CATEGORY_NAME_TAKEN',
      message: 'You have an archived Category called Food. Restore it instead.',
    })
  })

  it('takes a name used in the other kind', async () => {
    const cookie = await signInNewUser()

    const res = await postCategory(cookie, { name: 'Food', kind: 'income' })

    expect(res.status).toBe(201)
    expect((await namesFor(cookie)).income).toEqual([...INCOME, 'Food'])
  })

  it('takes a name another user has', async () => {
    const cookie = await signInNewUser()
    const other = await signInNewUser(OTHER_USER)
    await postCategory(other, { name: 'Pets', kind: 'expense' })

    const res = await postCategory(cookie, { name: 'Pets', kind: 'expense' })

    expect(res.status).toBe(201)
  })

  // Several rounds, as a race without the database's check doesn't show
  // every time.
  it('adds only one of two same names saved at the same moment', async () => {
    const cookie = await signInNewUser()

    for (let round = 1; round <= 5; round++) {
      const name = `Pets ${round}`
      const statuses = await Promise.all([
        postCategory(cookie, { name, kind: 'expense' }),
        postCategory(cookie, { name: name.toUpperCase(), kind: 'expense' }),
      ]).then((answers) => answers.map((res) => res.status).sort())

      expect(statuses, `round ${round}`).toEqual([201, 409])
    }
  })

  it('refuses the 51st Category of a kind that isn’t archived', async () => {
    const cookie = await signInNewUser()
    await addExpenseCategories(cookie, 50 - EXPENSE.length)

    const res = await postCategory(cookie, { name: 'One too many', kind: 'expense' })

    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ code: 'CATEGORY_LIMIT' })
    expect((await namesFor(cookie)).expense).toHaveLength(50)
  })

  it('counts neither archived Categories nor the other kind towards the limit', async () => {
    const cookie = await signInNewUser()
    await addExpenseCategories(cookie, 50 - EXPENSE.length)
    await db.update(categories).set({ archived: true }).where(eq(categories.name, 'Extra 1'))

    const expense = await postCategory(cookie, { name: 'In its place', kind: 'expense' })
    const income = await postCategory(cookie, { name: 'Gifts', kind: 'income' })

    expect(expense.status).toBe(201)
    expect(income.status).toBe(201)
  })

  it('adds only one of two Categories saved at the same moment when one place is left', async () => {
    const cookie = await signInNewUser()
    await addExpenseCategories(cookie, 49 - EXPENSE.length)

    const statuses = await Promise.all([
      postCategory(cookie, { name: 'Pets', kind: 'expense' }),
      postCategory(cookie, { name: 'Garden', kind: 'expense' }),
    ]).then((answers) => answers.map((res) => res.status).sort())

    expect(statuses).toEqual([201, 409])
    expect((await namesFor(cookie)).expense).toHaveLength(50)
  })

  it('takes a name of exactly 40 characters', async () => {
    const cookie = await signInNewUser()

    const res = await postCategory(cookie, { name: 'x'.repeat(40), kind: 'income' })

    expect(res.status).toBe(201)
  })
})

describe('PATCH /api/categories/:id', () => {
  it('renames a Category, keeping its kind and place', async () => {
    const cookie = await signInNewUser()
    const id = await idOf(cookie, 'expense', 'Health')

    const res = await patchCategory(cookie, id, { name: '  Medical  ', kind: 'income' })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ id, name: 'Medical', kind: 'expense' })
    expect((await namesFor(cookie)).expense).toEqual(EXPENSE.map((name) => (name === 'Health' ? 'Medical' : name)))
  })

  it('changes only the capitals', async () => {
    const cookie = await signInNewUser()
    const id = await idOf(cookie, 'income', 'Side income')

    const res = await patchCategory(cookie, id, { name: 'Side Income' })

    expect(res.status).toBe(200)
    expect((await namesFor(cookie)).income).toEqual(['Salary', 'Bonus', 'Side Income', 'Other'])
  })

  it('refuses a name another Category of the kind has, ignoring case', async () => {
    const cookie = await signInNewUser()
    const id = await idOf(cookie, 'expense', 'Health')

    const res = await patchCategory(cookie, id, { name: 'food' })

    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({
      code: 'CATEGORY_NAME_TAKEN',
      message: 'You already have an Expense Category called Food.',
    })
    expect((await namesFor(cookie)).expense).toEqual(EXPENSE)
  })

  it('says to restore an archived Category with the name', async () => {
    const cookie = await signInNewUser()
    const id = await idOf(cookie, 'income', 'Bonus')
    await db.update(categories).set({ archived: true }).where(eq(categories.name, 'Salary'))

    const res = await patchCategory(cookie, id, { name: 'SALARY' })

    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({
      code: 'CATEGORY_NAME_TAKEN',
      message: 'You have an archived Category called Salary. Restore it instead.',
    })
  })

  it('takes a name used in the other kind', async () => {
    const cookie = await signInNewUser()
    const id = await idOf(cookie, 'income', 'Bonus')

    const res = await patchCategory(cookie, id, { name: 'Food' })

    expect(res.status).toBe(200)
  })

  it.each([
    ['an empty name', { name: '' }],
    ['a blank name', { name: '   ' }],
    ['a name over 40 characters', { name: 'x'.repeat(41) }],
    ['no name', {}],
  ])('refuses %s', async (_, body) => {
    const cookie = await signInNewUser()
    const id = await idOf(cookie, 'expense', 'Health')

    const res = await patchCategory(cookie, id, body)

    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ code: 'INVALID_INPUT', fields: { name: expect.any(Array) } })
    expect((await namesFor(cookie)).expense).toEqual(EXPENSE)
  })

  it('gives 404 for an archived Category', async () => {
    const cookie = await signInNewUser()
    const id = await idOf(cookie, 'expense', 'Health')
    await db.update(categories).set({ archived: true }).where(eq(categories.id, id))

    const res = await patchCategory(cookie, id, { name: 'Medical' })

    expect(res.status).toBe(404)
    expect(await res.json()).toMatchObject({ code: 'CATEGORY_NOT_FOUND' })
    expect((await categoriesFor(cookie)).archived.expense.map((c) => c.name)).toEqual(['Health'])
  })
})

describe('POST /api/categories/:id/move', () => {
  it('swaps a Category with the one above it', async () => {
    const cookie = await signInNewUser()

    const res = await moveCategory(cookie, await idOf(cookie, 'income', 'Side income'), { direction: 'up' })

    expect(res.status).toBe(204)
    expect(await namesFor(cookie)).toEqual({ income: ['Salary', 'Side income', 'Bonus', 'Other'], expense: EXPENSE })
  })

  it('swaps a Category with the one below it', async () => {
    const cookie = await signInNewUser()

    const res = await moveCategory(cookie, await idOf(cookie, 'expense', 'Food'), { direction: 'down' })

    expect(res.status).toBe(204)
    expect((await namesFor(cookie)).expense.slice(0, 3)).toEqual(['Transport', 'Food', 'Housing'])
  })

  it('moves "Other" like any other Category', async () => {
    const cookie = await signInNewUser()

    await moveCategory(cookie, await idOf(cookie, 'income', 'Other'), { direction: 'up' })

    expect((await namesFor(cookie)).income).toEqual(['Salary', 'Bonus', 'Other', 'Side income'])
  })

  it('changes nothing when moving the first up or the last down', async () => {
    const cookie = await signInNewUser()

    const first = await moveCategory(cookie, await idOf(cookie, 'income', 'Salary'), { direction: 'up' })
    const last = await moveCategory(cookie, await idOf(cookie, 'income', 'Other'), { direction: 'down' })

    expect([first.status, last.status]).toEqual([204, 204])
    expect(await namesFor(cookie)).toEqual({ income: INCOME, expense: EXPENSE })
  })

  it('steps over archived Categories', async () => {
    const cookie = await signInNewUser()
    await db.update(categories).set({ archived: true }).where(eq(categories.name, 'Bonus'))

    await moveCategory(cookie, await idOf(cookie, 'income', 'Side income'), { direction: 'up' })

    expect((await namesFor(cookie)).income).toEqual(['Side income', 'Salary', 'Other'])
  })

  it('puts an added Category last, after a move', async () => {
    const cookie = await signInNewUser()
    await moveCategory(cookie, await idOf(cookie, 'income', 'Other'), { direction: 'up' })

    await postCategory(cookie, { name: 'Gifts', kind: 'income' })

    expect((await namesFor(cookie)).income).toEqual(['Salary', 'Bonus', 'Other', 'Side income', 'Gifts'])
  })

  // Several rounds, as a race without the lock doesn't show every time.
  it('leaves a clean order after two moves at the same moment', async () => {
    const cookie = await signInNewUser()

    for (let round = 1; round <= 5; round++) {
      await db.delete(categories)
      const salary = await idOf(cookie, 'income', 'Salary')

      const statuses = await Promise.all([
        moveCategory(cookie, salary, { direction: 'down' }),
        moveCategory(cookie, salary, { direction: 'down' }),
      ]).then((answers) => answers.map((res) => res.status))

      expect(statuses, `round ${round}`).toEqual([204, 204])
      expect((await namesFor(cookie)).income, `round ${round}`).toEqual(['Bonus', 'Side income', 'Salary', 'Other'])
    }
  })

  it.each([
    ['an unknown direction', { direction: 'left' }],
    ['no direction', {}],
  ])('refuses %s', async (_, body) => {
    const cookie = await signInNewUser()

    const res = await moveCategory(cookie, await idOf(cookie, 'income', 'Bonus'), body)

    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ code: 'INVALID_INPUT', fields: { direction: expect.any(Array) } })
  })

  it('gives 404 for an archived Category', async () => {
    const cookie = await signInNewUser()
    const id = await idOf(cookie, 'income', 'Bonus')
    await db.update(categories).set({ archived: true }).where(eq(categories.id, id))

    const res = await moveCategory(cookie, id, { direction: 'up' })

    expect(res.status).toBe(404)
    expect(await res.json()).toMatchObject({ code: 'CATEGORY_NOT_FOUND' })
  })
})

// This month in the user's zone (Kuala Lumpur), and the months around it.
const MONTH = monthOf(todayIn(NEW_USER.timeZone))
const LAST_MONTH = monthOf(addMonths(firstDayOf(MONTH), -1))
const NEXT_MONTH = monthOf(addMonths(firstDayOf(MONTH), 1))

async function userIdOf(cookie: string) {
  return ((await (await getMe(cookie)).json()) as { id: string }).id
}

async function addRecurring(cookie: string, body: Record<string, unknown>) {
  const res = await postRecurring(cookie, { varies: false, startDate: firstDayOf(NEXT_MONTH), ...body })
  if (res.status !== 201) throw new Error(`Adding a Recurring Transaction failed: ${res.status}`)
  return ((await res.json()) as { id: string }).id
}

// Sets one Category's limit from a month on, as Edit Budgets does.
async function setBudget(cookie: string, month: string, categoryId: string, limit: number | null) {
  const res = await putBudgets(cookie, { month }, { limits: [{ categoryId, limit }] })
  if (res.status !== 204) throw new Error(`Saving a Budget failed: ${res.status}`)
}

async function dashboardFor(cookie: string, month: string) {
  const res = await getDashboard(cookie, { month })
  if (res.status !== 200) throw new Error(`Loading the Dashboard failed: ${res.status}`)
  return (await res.json()) as {
    expenseCategories: {
      category: { id: string; name: string; archived: boolean }
      total: number
      budget: number | null
    }[]
    budgetsOverBy: number | null
  }
}

describe('POST /api/categories/:id/archive', () => {
  it('moves a Category to the archived list, and again when repeated', async () => {
    const cookie = await signInNewUser()
    const id = await idOf(cookie, 'expense', 'Health')

    const first = await archiveCategory(cookie, id)
    const again = await archiveCategory(cookie, id)

    expect([first.status, again.status]).toEqual([204, 204])
    const listed = await categoriesFor(cookie)
    expect(listed.expense.map((c) => c.name)).toEqual(EXPENSE.filter((name) => name !== 'Health'))
    expect(listed.archived.expense).toEqual([{ id, name: 'Health', kind: 'expense' }])
  })

  it('refuses the last Category of a kind that isn’t archived', async () => {
    const cookie = await signInNewUser()
    for (const name of ['Salary', 'Bonus', 'Side income']) {
      expect((await archiveCategory(cookie, await idOf(cookie, 'income', name))).status).toBe(204)
    }

    const res = await archiveCategory(cookie, await idOf(cookie, 'income', 'Other'))

    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({
      code: 'LAST_CATEGORY',
      message: 'This is your last Income Category. Add another before archiving it.',
    })
    expect((await namesFor(cookie)).income).toEqual(['Other'])
  })

  it('counts only the same kind for the last Category', async () => {
    const cookie = await signInNewUser()
    for (const name of ['Salary', 'Bonus', 'Side income']) {
      await archiveCategory(cookie, await idOf(cookie, 'income', name))
    }

    const res = await archiveCategory(cookie, await idOf(cookie, 'expense', 'Other'))

    expect(res.status).toBe(204)
  })

  it('refuses while a Recurring Transaction that isn’t stopped uses it, naming them', async () => {
    const cookie = await signInNewUser()
    const food = await idOf(cookie, 'expense', 'Food')
    const schedule = { frequency: 'monthly', day: 28 }
    const lunch = await addRecurring(cookie, { categoryId: food, amount: 4_500, note: 'Lunch', schedule })
    const transport = await idOf(cookie, 'expense', 'Transport')
    await addRecurring(cookie, { categoryId: transport, amount: 9_000, note: null, schedule })

    const res = await archiveCategory(cookie, food)

    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({
      code: 'CATEGORY_HAS_RECURRING',
      message: 'Recurring Transactions use this Category. Move them to another Category or stop them first.',
      recurring: [{ id: lunch, amount: 4_500, note: 'Lunch', schedule }],
    })
    expect((await namesFor(cookie)).expense).toEqual(EXPENSE)
  })

  it('isn’t blocked by a stopped Recurring Transaction', async () => {
    const cookie = await signInNewUser()
    const food = await idOf(cookie, 'expense', 'Food')
    const lunch = await addRecurring(cookie, {
      categoryId: food,
      amount: 4_500,
      note: null,
      schedule: { frequency: 'monthly', day: 28 },
    })
    await stopRecurring(cookie, lunch)

    const res = await archiveCategory(cookie, food)

    expect(res.status).toBe(204)
  })

  // Several rounds, as a race without the lock doesn't show every time.
  it('never leaves a Recurring Transaction under it when one is added at the same moment', async () => {
    const cookie = await signInNewUser()

    for (let round = 1; round <= 5; round++) {
      const created = await postCategory(cookie, { name: `Round ${round}`, kind: 'expense' })
      const { id } = (await created.json()) as { id: string }

      const [archived, added] = await Promise.all([
        archiveCategory(cookie, id),
        postRecurring(cookie, {
          categoryId: id,
          amount: 4_500,
          note: null,
          varies: false,
          schedule: { frequency: 'monthly', day: 28 },
          startDate: firstDayOf(NEXT_MONTH),
        }),
      ])

      expect([[204, 404], [409, 201]], `round ${round}`).toContainEqual([archived.status, added.status])
    }
  })

  describe('its Budget', () => {
    // 1am on 1 November in Kuala Lumpur, still October in UTC.
    it('ends from this month in the user’s time zone', async () => {
      vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-31T17:00:00Z') })
      try {
        const cookie = await signInNewUser()
        const food = await idOf(cookie, 'expense', 'Food')
        await setBudget(cookie, '2026-10', food, 80_000)

        await archiveCategory(cookie, food)

        expect((await dashboardFor(cookie, '2026-10')).expenseCategories).toEqual([
          { category: { id: food, name: 'Food', archived: true }, total: 0, budget: 80_000 },
        ])
        expect((await dashboardFor(cookie, '2026-11')).expenseCategories).toEqual([])
      } finally {
        vi.useRealTimers()
      }
    })

    it('ends from this month, removing later changes, and earlier months keep their limits', async () => {
      const cookie = await signInNewUser()
      const food = await idOf(cookie, 'expense', 'Food')
      await setBudget(cookie, LAST_MONTH, food, 80_000)
      await setBudget(cookie, NEXT_MONTH, food, 90_000)

      expect((await archiveCategory(cookie, food)).status).toBe(204)

      // Last month's row is still there, archived, and counts towards the
      // warning, as nothing was earned.
      const last = await dashboardFor(cookie, LAST_MONTH)
      expect(last.expenseCategories).toEqual([
        { category: { id: food, name: 'Food', archived: true }, total: 0, budget: 80_000 },
      ])
      expect(last.budgetsOverBy).toBe(80_000)
      for (const month of [MONTH, NEXT_MONTH]) {
        const shown = await dashboardFor(cookie, month)
        expect(shown.expenseCategories, month).toEqual([])
        expect(shown.budgetsOverBy, month).toBeNull()
      }
    })

    it('shows an earlier month’s archived row with what was spent against it', async () => {
      const cookie = await signInNewUser()
      const food = await idOf(cookie, 'expense', 'Food')
      await setBudget(cookie, LAST_MONTH, food, 10_000)
      await db.insert(transactions).values({
        userId: await userIdOf(cookie),
        categoryId: food,
        amount: 12_000,
        date: `${LAST_MONTH}-15`,
      })

      await archiveCategory(cookie, food)

      expect((await dashboardFor(cookie, LAST_MONTH)).expenseCategories).toEqual([
        { category: { id: food, name: 'Food', archived: true }, total: 12_000, budget: 10_000 },
      ])
    })

    it('stores nothing when this month has no limit already', async () => {
      const cookie = await signInNewUser()
      const food = await idOf(cookie, 'expense', 'Food')

      await archiveCategory(cookie, food)

      expect(await db.$count(budgets)).toBe(0)
    })

    it('is never listed in Edit Budgets again, and can’t be given a limit', async () => {
      const cookie = await signInNewUser()
      const food = await idOf(cookie, 'expense', 'Food')
      await setBudget(cookie, MONTH, food, 80_000)
      await archiveCategory(cookie, food)

      const listed = (await (await getBudgets(cookie, { month: LAST_MONTH })).json()) as { category: { id: string } }[]
      const put = await putBudgets(cookie, { month: NEXT_MONTH }, { limits: [{ categoryId: food, limit: 5_000 }] })

      expect(listed.map((b) => b.category.id)).not.toContain(food)
      expect(put.status).toBe(404)
      expect(await put.json()).toMatchObject({ code: 'CATEGORY_NOT_FOUND' })
    })
  })
})

describe('POST /api/categories/:id/restore', () => {
  it('puts an archived Category back, last in its kind, and again when repeated', async () => {
    const cookie = await signInNewUser()
    const food = await idOf(cookie, 'expense', 'Food')
    await archiveCategory(cookie, food)

    const first = await restoreCategory(cookie, food)
    const again = await restoreCategory(cookie, food)

    expect([first.status, again.status]).toEqual([204, 204])
    const listed = await categoriesFor(cookie)
    expect(listed.expense.map((c) => c.name)).toEqual([...EXPENSE.filter((name) => name !== 'Food'), 'Food'])
    expect(listed.archived.expense).toEqual([])
  })

  it('leaves a Category that isn’t archived where it is', async () => {
    const cookie = await signInNewUser()

    const res = await restoreCategory(cookie, await idOf(cookie, 'expense', 'Food'))

    expect(res.status).toBe(204)
    expect(await namesFor(cookie)).toEqual({ income: INCOME, expense: EXPENSE })
  })

  it('brings no Budget back', async () => {
    const cookie = await signInNewUser()
    const food = await idOf(cookie, 'expense', 'Food')
    await setBudget(cookie, MONTH, food, 80_000)
    await archiveCategory(cookie, food)

    await restoreCategory(cookie, food)

    const listed = (await (await getBudgets(cookie, { month: MONTH })).json()) as {
      category: { id: string }
      limit: number | null
    }[]
    expect(listed.find((b) => b.category.id === food)?.limit).toBeNull()
  })

  it('can be renamed and moved again once restored', async () => {
    const cookie = await signInNewUser()
    const food = await idOf(cookie, 'expense', 'Food')
    await archiveCategory(cookie, food)
    await restoreCategory(cookie, food)

    const renamed = await patchCategory(cookie, food, { name: 'Groceries' })
    const moved = await moveCategory(cookie, food, { direction: 'up' })

    expect([renamed.status, moved.status]).toEqual([200, 204])
    expect((await namesFor(cookie)).expense.slice(-2)).toEqual(['Groceries', 'Other'])
  })

  it('gives 404 for another user’s archived Category and leaves it archived', async () => {
    const cookie = await signInNewUser()
    const other = await signInNewUser(OTHER_USER)
    const theirs = await idOf(other, 'expense', 'Food')
    await archiveCategory(other, theirs)

    const res = await restoreCategory(cookie, theirs)

    expect(res.status).toBe(404)
    expect((await categoriesFor(other)).archived.expense.map((c) => c.name)).toEqual(['Food'])
  })

  it('refuses the 51st Category of a kind that isn’t archived', async () => {
    const cookie = await signInNewUser()
    const food = await idOf(cookie, 'expense', 'Food')
    await archiveCategory(cookie, food)
    await addExpenseCategories(cookie, 50 - (EXPENSE.length - 1))

    const res = await restoreCategory(cookie, food)

    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({
      code: 'CATEGORY_LIMIT',
      message: 'You can have up to 50 Expense Categories.',
    })
    expect((await categoriesFor(cookie)).archived.expense.map((c) => c.name)).toEqual(['Food'])
  })
})

describe('every Category write', () => {
  const writes = {
    rename: (cookie: string | undefined, id: string) => patchCategory(cookie, id, { name: 'Medical' }),
    move: (cookie: string | undefined, id: string) => moveCategory(cookie, id, { direction: 'up' }),
    archive: archiveCategory,
    restore: restoreCategory,
  }

  it.each(Object.entries(writes))('%s gives 404 for another user’s Category and leaves it alone', async (_, write) => {
    const cookie = await signInNewUser()
    const other = await signInNewUser(OTHER_USER)
    const theirs = await idOf(other, 'expense', 'Health')

    const res = await write(cookie, theirs)

    expect(res.status).toBe(404)
    expect(await res.json()).toMatchObject({ code: 'CATEGORY_NOT_FOUND' })
    expect(await namesFor(other)).toEqual({ income: INCOME, expense: EXPENSE })
  })

  it.each(Object.entries(writes))('%s gives 404 for a Category that doesn’t exist', async (_, write) => {
    const cookie = await signInNewUser()

    const res = await write(cookie, '00000000-0000-4000-8000-000000000000')

    expect(res.status).toBe(404)
    expect(await res.json()).toMatchObject({ code: 'CATEGORY_NOT_FOUND' })
  })

  it.each(Object.entries(writes))('%s gives 404 for an ID that isn’t an ID', async (_, write) => {
    const cookie = await signInNewUser()

    const res = await write(cookie, 'not-an-id')

    expect(res.status).toBe(404)
    expect(await res.json()).toMatchObject({ code: 'CATEGORY_NOT_FOUND' })
  })

  it.each([
    ['add', (cookie: string | undefined) => postCategory(cookie, { name: 'Pets', kind: 'expense' })],
    ['rename', (cookie: string | undefined) => writes.rename(cookie, '00000000-0000-4000-8000-000000000000')],
    ['move', (cookie: string | undefined) => writes.move(cookie, '00000000-0000-4000-8000-000000000000')],
    ['archive', (cookie: string | undefined) => writes.archive(cookie, '00000000-0000-4000-8000-000000000000')],
    ['restore', (cookie: string | undefined) => writes.restore(cookie, '00000000-0000-4000-8000-000000000000')],
  ])('%s gives 401 with no session', async (_, write) => {
    const res = await write(undefined)

    expect(res.status).toBe(401)
  })

  it('refuses the 61st write in a minute with 429, whichever it is', async () => {
    const cookie = await signInNewUser()
    const bonus = await idOf(cookie, 'income', 'Bonus')
    writeLimit.now = () => 1_000_000
    // Each counts, though it's refused.
    for (let i = 0; i < 60; i++) await postCategory(cookie, { name: '', kind: 'expense' })

    const answers = await Promise.all([
      postCategory(cookie, { name: 'Pets', kind: 'expense' }),
      patchCategory(cookie, bonus, { name: 'Commission' }),
      moveCategory(cookie, bonus, { direction: 'down' }),
      archiveCategory(cookie, bonus),
      restoreCategory(cookie, bonus),
    ])

    expect(answers.map((res) => res.status)).toEqual([429, 429, 429, 429, 429])
    expect(await namesFor(cookie)).toEqual({ income: INCOME, expense: EXPENSE })
  }, 20_000)
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

describe('the categories table', () => {
  it('refuses a second Category with the same name in a kind, ignoring case', async () => {
    const cookie = await signInNewUser()
    const { id: userId } = (await (await getMe(cookie)).json()) as { id: string }

    const write = db.insert(categories).values({ userId, name: 'FOOD', kind: 'expense', position: 99, archived: true })

    await expect(write).rejects.toMatchObject({ cause: { constraint: 'categories_user_id_kind_name_unique' } })
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
