import { describe, expect, it } from 'vitest'
import { budgetsOverBy, formatAmount, formatShare, monthPlan, perDayLeft } from '../src/index.js'

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

describe('monthPlan', () => {
  // v1-spec "Dashboard maths", with RM5,000 salary recorded, a RM1,000 bonus
  // still due, RM1,500 rent and RM200 internet created by Recurring
  // Transactions, RM150 electricity still due, and RM800 of other Expenses.
  it('works out Expected Income, Commitments, Free to Spend and Remaining', () => {
    const plan = monthPlan({
      recorded: { income: 500_000, expense: 250_000 },
      fromRecurring: { income: 500_000, expense: 170_000 },
      upcoming: { income: 100_000, expense: 15_000 },
    })

    expect(plan).toEqual({
      expectedIncome: 600_000,
      commitments: 185_000,
      freeToSpend: 415_000,
      remaining: 335_000,
    })
  })

  // Before the salary is recorded, Expected Income still counts it.
  it('counts recurring Income still due before any is recorded', () => {
    const plan = monthPlan({
      recorded: { income: 0, expense: 1_250 },
      fromRecurring: { income: 0, expense: 0 },
      upcoming: { income: 500_000, expense: 150_000 },
    })

    expect(plan).toEqual({ expectedIncome: 500_000, commitments: 150_000, freeToSpend: 350_000, remaining: 348_750 })
  })

  it('goes below zero when spending passes Free to Spend', () => {
    const plan = monthPlan({
      recorded: { income: 100_000, expense: 124_000 },
      fromRecurring: { income: 0, expense: 0 },
      upcoming: { income: 0, expense: 0 },
    })

    expect(plan.remaining).toBe(-24_000)
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
