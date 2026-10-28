import { z } from 'zod'
import type { CurrencyCode } from './currency.js'
import type { CalendarMonth } from './dates.js'
import { amountInputSchema } from './money.js'
import { amountSchema } from './transactions.js'

// One change to an Expense Category's Budget: from `month` on, its limit is
// `limit` minor units, or there is none (null). A Budget is stored as these
// changes, never as a set per month (ADR 0007).
export interface BudgetChange {
  month: CalendarMonth
  limit: number | null
}

// A month's limit for one Category: the latest change at or before it, or no
// limit before the first change. The changes can come in any order.
export function limitIn(changes: readonly BudgetChange[], month: CalendarMonth): number | null {
  let latest: BudgetChange | undefined
  for (const change of changes) {
    if (change.month <= month && (!latest || change.month > latest.month)) latest = change
  }
  return latest?.limit ?? null
}

// What saving `limit` for `month` does to one Category's changes. The limit
// the month already has stores 'nothing'. Otherwise the month gets its own
// change, replacing any it had ('store'), unless the month would carry that
// limit in anyway, when its own change is dropped instead ('drop'), so it
// never just repeats the limit before it.
export function savingLimit(
  changes: readonly BudgetChange[],
  month: CalendarMonth,
  limit: number | null,
): 'nothing' | 'store' | 'drop' {
  if (limitIn(changes, month) === limit) return 'nothing'
  const earlier = changes.filter((change) => change.month < month)
  const hasOwn = changes.some((change) => change.month === month)
  return hasOwn && limitIn(earlier, month) === limit ? 'drop' : 'store'
}

// How far through a Budget a month is: the bar's fill, from 0 to 1, and the
// money left or how much it's Overspent by, in minor units.
export type BudgetProgress = { fill: number } & (
  | { overspent: false; left: number }
  | { overspent: true; by: number }
)

// Where a month's Budget stands, given its Category's Expenses that month,
// both in minor units. The bar fills to the share of the limit spent and
// never past it. Spending exactly the limit leaves 0 and isn't Overspent
// (v1-spec "Budgets").
export function budgetProgress(spent: number, limit: number): BudgetProgress {
  const fill = Math.min(spent / limit, 1)
  return spent > limit ? { fill, overspent: true, by: spent - limit } : { fill, overspent: false, left: limit - spent }
}

// A typed limit field: blank for no limit, otherwise read as a Transaction's
// amount is, with the currency's own decimal places, never rounded, and zero
// refused (v1-spec "Budgets").
export function limitInputSchema(currency: CurrencyCode) {
  const amount = amountInputSchema(currency)
  return z.string().transform((typed, ctx) => {
    if (typed.trim() === '') return null
    const parsed = amount.safeParse(typed)
    if (parsed.success) return parsed.data
    for (const issue of parsed.error.issues) ctx.addIssue({ code: 'custom', message: issue.message })
    return z.NEVER
  })
}

// What the API takes to set a month's Budgets: each Category's limit in minor
// units, under a Transaction amount's bounds, or null for no limit. The ID
// isn't checked here, as one that isn't an ID gets the same 404 as one that
// isn't the user's.
export const budgetLimitsSchema = z.object({
  limits: z
    .array(z.object({ categoryId: z.string(), limit: amountSchema.nullable() }))
    .refine(
      (limits) => new Set(limits.map((l) => l.categoryId)).size === limits.length,
      'List each Category once',
    ),
})

export type BudgetLimits = z.output<typeof budgetLimitsSchema>
