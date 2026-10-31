import { describe, expect, it } from 'vitest'
import {
  type ActiveRecurringTransaction,
  budgetsOverBy,
  type CalendarDate,
  type CalendarMonth,
  type CategoryKind,
  type CategoryMonth,
  formatAmount,
  formatShare,
  monthFigures,
  perDayLeft,
  type Schedule,
} from '../src/index.js'

describe('formatShare', () => {
  it('is a whole percentage of the month’s Expenses', () => {
    expect(formatShare(82_000, 241_176)).toBe('34%')
  })

  it('rounds halves up', () => {
    expect(formatShare(1, 8)).toBe('13%')
    expect(formatShare(5, 200)).toBe('3%')
  })

  // v1-spec "The Dashboard": a share under 1% never shows as "0%".
  it('shows "<1%" for a share that rounds to nothing', () => {
    expect(formatShare(1, 1_000)).toBe('<1%')
    expect(formatShare(4, 1_000)).toBe('<1%')
  })

  it('shows 1% from half a percent', () => {
    expect(formatShare(5, 1_000)).toBe('1%')
  })

  it('is 100% for the only Category', () => {
    expect(formatShare(1_250, 1_250)).toBe('100%')
  })

  // Nothing adjusts rounded shares to add up to 100%.
  it('rounds each share on its own', () => {
    expect([1, 1, 1].map((total) => formatShare(total, 3))).toEqual(['33%', '33%', '33%'])
  })

  it('refuses a month with no Expenses', () => {
    expect(() => formatShare(0, 0)).toThrow()
  })

  it('is exact for the largest totals', () => {
    expect(formatShare(100_000_000_000 * 1_000, 100_000_000_000 * 3_000)).toBe('33%')
  })
})

describe('perDayLeft', () => {
  // v1-spec "Budgets": RM420 left ÷ 12 days = RM35/day, counting today.
  it('spreads the money left over the days left in the month, counting today', () => {
    expect(perDayLeft(42_000, '2026-10', '2026-10-20')).toBe(3_500)
  })

  // So it never shows more than is really left.
  it('rounds down to a whole minor unit', () => {
    expect(perDayLeft(42_011, '2026-10', '2026-10-20')).toBe(3_500)
    expect(perDayLeft(100, '2026-10', '2026-10-29')).toBe(33)
  })

  it('is all the money left on the last day of the month', () => {
    expect(perDayLeft(42_011, '2026-10', '2026-10-31')).toBe(42_011)
    expect(perDayLeft(42_011, '2026-02', '2026-02-28')).toBe(42_011)
  })

  it('is 0 with nothing left', () => {
    expect(perDayLeft(0, '2026-10', '2026-10-20')).toBe(0)
  })

  // A whole minor unit is a whole yen, as JPY has no decimal places: ¥1,000
  // over 3 days shows as ¥333, never ¥333.33.
  it('reads as whole yen in JPY', () => {
    expect(formatAmount(perDayLeft(1_000, '2026-10', '2026-10-29')!, 'JPY')).toBe('JP¥333')
  })

  // v1-spec "Budgets": for this month only, so the user's today is in it.
  it('has no figure for a past or future month', () => {
    expect(perDayLeft(42_000, '2026-09', '2026-10-20')).toBeNull()
    expect(perDayLeft(42_000, '2026-11', '2026-10-20')).toBeNull()
  })
})

describe('monthFigures', () => {
  // A Category named for its ID: "food" is Food.
  function newCategory(id: string, kind: CategoryKind, position: number, archived = false) {
    return { id, name: id[0]!.toUpperCase() + id.slice(1), kind, archived, position }
  }
  type TestCategory = ReturnType<typeof newCategory>

  // What was recorded under a Category in the month: its total, and the part
  // Recurring Transactions created.
  function recorded(category: TestCategory, total: number, fromRecurring = 0): CategoryMonth {
    return { category, total, fromRecurring }
  }

  function recurringIn(
    category: TestCategory,
    { id, amount, schedule, nextDueDate, varies = false }: {
      id: string
      amount: number
      schedule: Schedule
      nextDueDate: CalendarDate
      varies?: boolean
    },
  ): ActiveRecurringTransaction {
    const { id: categoryId, name, kind, archived } = category
    return { id, amount, schedule, nextDueDate, varies, note: null, category: { id: categoryId, name, kind, archived } }
  }

  const salary = newCategory('salary', 'income', 0)
  const bonus = newCategory('bonus', 'income', 1)
  const food = newCategory('food', 'expense', 0)
  const transport = newCategory('transport', 'expense', 1)
  const housing = newCategory('housing', 'expense', 2)
  const utilities = newCategory('utilities', 'expense', 3)
  const bills = newCategory('bills', 'expense', 4)

  // v1-spec "Dashboard maths", with RM5,000 salary and RM1,500 rent and
  // RM200 internet already created by Recurring Transactions, a RM1,000
  // bonus and RM150 electricity still due, and RM800 of other Expenses.
  it('works out Expected Income, Commitments, Free to Spend and Remaining', () => {
    const figures = monthFigures({
      month: '2026-11',
      categories: [
        recorded(salary, 500_000, 500_000),
        recorded(housing, 150_000, 150_000),
        recorded(bills, 20_000, 20_000),
        recorded(food, 80_000),
      ],
      recurring: [
        // Created on the 1st, so its next is in December: nothing Upcoming.
        recurringIn(salary, {
          id: 'pay',
          amount: 500_000,
          schedule: { frequency: 'monthly', day: 1 },
          nextDueDate: '2026-12-01',
        }),
        recurringIn(bonus, {
          id: 'bonus',
          amount: 100_000,
          schedule: { frequency: 'monthly', day: 28 },
          nextDueDate: '2026-11-28',
        }),
        recurringIn(utilities, {
          id: 'electricity',
          amount: 15_000,
          schedule: { frequency: 'monthly', day: 20 },
          nextDueDate: '2026-11-20',
        }),
      ],
      budgets: [],
    })

    expect(figures.totals).toEqual({ income: 500_000, expense: 250_000 })
    expect(figures.plan).toEqual({
      expectedIncome: 600_000,
      commitments: 185_000,
      freeToSpend: 415_000,
      remaining: 335_000,
    })
    // Created and Upcoming alike, Expense Categories only.
    expect(figures.commitmentsByCategory).toEqual({ housing: 150_000, bills: 20_000, utilities: 15_000 })
  })

  it('goes below zero when spending passes Free to Spend', () => {
    const figures = monthFigures({
      month: '2026-11',
      categories: [recorded(salary, 100_000), recorded(food, 124_000)],
      recurring: [],
      budgets: [],
    })

    expect(figures.plan.remaining).toBe(-24_000)
  })

  describe('Upcoming', () => {
    const recurring = [
      recurringIn(housing, {
        id: 'rent',
        amount: 150_000,
        schedule: { frequency: 'monthly', day: 25 },
        nextDueDate: '2026-11-25',
      }),
      recurringIn(food, {
        id: 'groceries',
        amount: 20_000,
        schedule: { frequency: 'weekly', weekday: 1 },
        nextDueDate: '2026-11-09',
        varies: true,
      }),
    ]

    function upcomingIn(month: CalendarMonth) {
      return monthFigures({ month, categories: [], recurring, budgets: [] }).upcoming.map(
        ({ recurringTransactionId, dueDate }) => [recurringTransactionId, dueDate],
      )
    }

    // 2 Nov is a Monday, but already created: the next is 9 Nov.
    it('holds the rest of this month, from each one’s next Due Date, in date order', () => {
      expect(upcomingIn('2026-11')).toEqual([
        ['groceries', '2026-11-09'],
        ['groceries', '2026-11-16'],
        ['groceries', '2026-11-23'],
        ['rent', '2026-11-25'],
        ['groceries', '2026-11-30'],
      ])
    })

    it('holds every Due Date of a future month', () => {
      expect(upcomingIn('2026-12')).toEqual([
        ['groceries', '2026-12-07'],
        ['groceries', '2026-12-14'],
        ['groceries', '2026-12-21'],
        ['rent', '2026-12-25'],
        ['groceries', '2026-12-28'],
      ])
    })

    it('is empty for a past month', () => {
      expect(upcomingIn('2026-10')).toEqual([])
    })

    it('counts each Due Date at its Recurring Transaction’s amount, marking Estimates', () => {
      const figures = monthFigures({ month: '2026-12', categories: [], recurring, budgets: [] })

      expect(figures.upcoming[0]).toEqual({
        recurringTransactionId: 'groceries',
        dueDate: '2026-12-07',
        amount: 20_000,
        estimate: true,
        note: null,
        category: { id: 'food', name: 'Food', kind: 'expense', archived: false },
      })
      expect(figures.plan.commitments).toBe(4 * 20_000 + 150_000)
      expect(figures.commitmentsByCategory).toEqual({ food: 80_000, housing: 150_000 })
    })

    // Before the salary is recorded, Expected Income still counts it.
    it('counts recurring Income still due towards Expected Income', () => {
      const figures = monthFigures({
        month: '2026-12',
        categories: [recorded(food, 1_250)],
        recurring: [
          recurringIn(salary, {
            id: 'pay',
            amount: 500_000,
            schedule: { frequency: 'monthly', day: 25 },
            nextDueDate: '2026-11-25',
          }),
          recurringIn(housing, {
            id: 'rent',
            amount: 150_000,
            schedule: { frequency: 'monthly', day: 1 },
            nextDueDate: '2026-12-01',
          }),
        ],
        budgets: [],
      })

      expect(figures.plan).toEqual({
        expectedIncome: 500_000,
        commitments: 150_000,
        freeToSpend: 350_000,
        remaining: 348_750,
      })
    })
  })

  describe('Expenses by Category', () => {
    const health = newCategory('health', 'expense', 6, true)
    const shopping = newCategory('shopping', 'expense', 5)
    const family = newCategory('family', 'expense', 8)

    it('lists the largest first, then by position, then budgeted ones with nothing spent', () => {
      const figures = monthFigures({
        month: '2026-11',
        categories: [
          recorded(health, 30_000),
          recorded(salary, 500_000),
          recorded(food, 30_000),
          recorded(transport, 50_000),
        ],
        recurring: [],
        // In position order, as monthBudgets gives them.
        budgets: [
          { category: food, limit: 40_000 },
          { category: transport, limit: null },
          { category: utilities, limit: 10_000 },
          { category: shopping, limit: null },
          { category: family, limit: 5_000 },
        ],
      })

      expect(figures.expenseCategories).toEqual([
        { category: { id: 'transport', name: 'Transport', archived: false }, total: 50_000, budget: null },
        { category: { id: 'food', name: 'Food', archived: false }, total: 30_000, budget: 40_000 },
        // Archived, but it has Expenses that month.
        { category: { id: 'health', name: 'Health', archived: true }, total: 30_000, budget: null },
        { category: { id: 'utilities', name: 'Utilities', archived: false }, total: 0, budget: 10_000 },
        { category: { id: 'family', name: 'Family', archived: false }, total: 0, budget: 5_000 },
      ])
    })

    // A Budget kept from before the Category was archived (v1-spec "Budgets").
    it('marks a budgeted row with nothing spent as archived when its Category is', () => {
      const figures = monthFigures({
        month: '2026-09',
        categories: [],
        recurring: [],
        budgets: [{ category: health, limit: 20_000 }],
      })

      expect(figures.expenseCategories).toEqual([
        { category: { id: 'health', name: 'Health', archived: true }, total: 0, budget: 20_000 },
      ])
      expect(figures.budgetsOverBy).toBe(20_000)
    })

    // Positions aren't unique, so equal totals at the same position fall back
    // to the Category's ID, whichever order they come in.
    it('orders equal totals at the same position by ID', () => {
      const pets = newCategory('pets', 'expense', 7)
      const gifts = newCategory('gifts', 'expense', 7)
      const figures = monthFigures({
        month: '2026-11',
        categories: [recorded(pets, 10_000), recorded(gifts, 10_000)],
        recurring: [],
        budgets: [],
      })

      expect(figures.expenseCategories.map(({ category }) => category.id)).toEqual(['gifts', 'pets'])
    })

    it('warns when Budgets and Commitments go past Expected Income', () => {
      const figures = monthFigures({
        month: '2026-11',
        categories: [recorded(salary, 200_000), recorded(housing, 150_000, 150_000)],
        recurring: [],
        budgets: [{ category: food, limit: 100_000 }],
      })

      expect(figures.budgetsOverBy).toBe(50_000)
    })
  })
})

describe('budgetsOverBy', () => {
  it('is null when Budgets and Commitments fit Expected Income', () => {
    expect(
      budgetsOverBy({
        limits: [{ categoryId: 'food', limit: 100_000 }],
        commitmentsByCategory: { housing: 150_000 },
        expectedIncome: 250_000,
      }),
    ).toBeNull()
  })

  it('says how far they go past Expected Income', () => {
    expect(
      budgetsOverBy({
        limits: [{ categoryId: 'food', limit: 100_000 }],
        commitmentsByCategory: { housing: 150_000 },
        expectedIncome: 218_000,
      }),
    ).toBe(32_000)
  })

  // Rent budgeted under Housing is covered by Housing's Budget.
  it('doesn’t count a Commitment in a budgeted Category twice', () => {
    expect(
      budgetsOverBy({
        limits: [
          { categoryId: 'food', limit: 100_000 },
          { categoryId: 'housing', limit: 150_000 },
        ],
        commitmentsByCategory: { housing: 150_000 },
        expectedIncome: 250_000,
      }),
    ).toBeNull()
  })

  it('counts a Commitment in a Category whose limit was removed', () => {
    expect(
      budgetsOverBy({
        limits: [{ categoryId: 'housing', limit: null }],
        commitmentsByCategory: { housing: 150_000 },
        expectedIncome: 100_000,
      }),
    ).toBe(50_000)
  })

  it('fits exactly at Expected Income', () => {
    expect(
      budgetsOverBy({
        limits: [{ categoryId: 'food', limit: 100_000 }],
        commitmentsByCategory: {},
        expectedIncome: 100_000,
      }),
    ).toBeNull()
  })
})
