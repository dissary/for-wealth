import { z } from 'zod'
import { budgetProgress } from './budgets.js'
import type { CurrencyCode } from './currency.js'
import { addMonths, type CalendarMonth, firstDayOf, isCalendarMonth, monthOf, todayIn, utcMidnight } from './dates.js'
import { decimalPlacesOf, formatAmount } from './money.js'
import { formatPeriodLabel } from './periods.js'
import { EARLIEST_DATE } from './transactions.js'

// How many months Trends shows at once: a year (v1-spec "Trends").
export const TRENDS_WINDOW = 12

// The month `months` later, or earlier for a negative number.
function stepMonths(month: CalendarMonth, months: number): CalendarMonth {
  return monthOf(addMonths(firstDayOf(month), months))
}

// The months Trends shows, oldest first: the year ending with `to`, less the
// months before `first`, the month of the user's earliest Transaction. Empty
// with no Transactions (`first` null) or when the first is after `to`.
export function trendsMonths(to: CalendarMonth, first: CalendarMonth | null): CalendarMonth[] {
  if (first === null || first > to) return []
  const yearStart = stepMonths(to, 1 - TRENDS_WINDOW)
  const start = first > yearStart ? first : yearStart
  const months: CalendarMonth[] = []
  for (let month = start; month <= to; month = stepMonths(month, 1)) months.push(month)
  return months
}

// The last month of the window Trends shows after ‹ (-1) or › (1): a whole
// year earlier or later, except that › never goes past this month, so from a
// window ending within the last year it lands on this month (v1-spec
// "Trends"). Null when that way is off: › once the window ends this month,
// and ‹ once it starts at `first`, the month of the user's earliest
// Transaction, as nothing comes before it, or with no Transactions (`first`
// null).
export function stepTrendsWindow(
  to: CalendarMonth,
  direction: -1 | 1,
  { first, thisMonth }: { first: CalendarMonth | null; thisMonth: CalendarMonth },
): CalendarMonth | null {
  if (direction === 1) {
    if (to >= thisMonth) return null
    const next = stepMonths(to, TRENDS_WINDOW)
    return next < thisMonth ? next : thisMonth
  }
  if (first === null || first >= stepMonths(to, 1 - TRENDS_WINDOW)) return null
  return stepMonths(to, -TRENDS_WINDOW)
}

// Read and formatted in UTC, like the other month labels, so the device's
// zone can't move a month.
const shortMonthLabel = new Intl.DateTimeFormat('en-MY', { month: 'short', year: 'numeric', timeZone: 'UTC' })

// The months a Trends window shows, as named beside ‹ ›: "Dec 2025 – Nov
// 2026", or "Nov 2026" for a lone month. `months` is oldest first and not
// empty, as trendsMonths gives them.
export function formatTrendsWindow(months: readonly CalendarMonth[]): string {
  const label = (month: CalendarMonth) => shortMonthLabel.format(utcMidnight(firstDayOf(month)))
  const first = label(months[0]!)
  const last = label(months.at(-1)!)
  return first === last ? first : `${first} \u2013 ${last}`
}

// The last month of a Trends window, for a user in `timeZone`: from the month
// holding 1 Jan 2000 up to this month in their zone, never a later one, as
// nothing after this month has happened yet (v1-spec "Trends").
export function trendsToSchema(timeZone: string, now: Date = new Date()) {
  const today = todayIn(timeZone, now)
  return z
    .string({ error: 'Enter a month' })
    // Stops here for a non-month, which the bounds can't say anything about.
    .refine(isCalendarMonth, { error: 'Enter a month', abort: true })
    .refine(
      (month) => month >= monthOf(EARLIEST_DATE),
      `Use a month from ${formatPeriodLabel('month', EARLIEST_DATE)}`,
    )
    .refine((month) => month <= monthOf(today), `Use a month up to ${formatPeriodLabel('month', today)}`)
}

// Net for display: "+RM4,200.00" when Income is larger, "−RM300.00" (a true
// minus sign) when Expenses are, and "RM0.00" when they match. The sign says
// which; it is never red or green (v1-spec "Trends").
export function formatNet(minorUnits: number, currency: CurrencyCode): string {
  if (minorUnits < 0) return `\u2212${formatAmount(-minorUnits, currency)}`
  return formatAmount(minorUnits, currency, minorUnits > 0 ? 'income' : undefined)
}

// Tops whose half is tidy too, in whole currency units, times a power of ten.
const TIDY_TOPS = [1, 2, 4, 6, 8, 10]

const axisLabel = new Intl.NumberFormat('en-MY', { notation: 'compact', maximumFractionDigits: 1 })

// The value axis of a Trends chart whose largest column is `max` minor units:
// its top, the smallest tidy whole amount at or above `max`, and gridlines at
// zero, half and the top, labelled in whole currency units ("6k"), with the
// currency's own decimal places. The top is at least 2 whole units, so the
// half is whole too.
export function trendsScale(max: number, currency: CurrencyCode) {
  const unit = 10 ** decimalPlacesOf(currency)
  const whole = Math.max(max / unit, 2)
  const power = 10 ** Math.floor(Math.log10(whole))
  const top = TIDY_TOPS.map((m) => m * power).find((t) => t >= whole)!
  return {
    top: top * unit,
    ticks: [0, top / 2, top].map((value) => ({
      value: value * unit,
      label: axisLabel.format(value).toLowerCase(),
    })),
  }
}

// One month of one Category on Trends: its total and the Budget limit carried
// forward to it, both in minor units, or null with no limit.
export interface CategoryTrendsMonth {
  month: CalendarMonth
  total: number
  budget: number | null
}

// The figures over one Category's chart, for the months shown, which aren't
// empty: their total, the average a month, rounded to a whole minor unit, and
// how many of the months with a Budget were Overspent. This month is left out
// of that count, as it's still filling (v1-spec "Trends").
export function categoryTrendsFigures(months: readonly CategoryTrendsMonth[], thisMonth: CalendarMonth) {
  const total = months.reduce((sum, month) => sum + month.total, 0)
  const budgeted = months.filter((month) => month.budget !== null && month.month !== thisMonth)
  return {
    total,
    average: Math.round(total / months.length),
    // Counted as the Dashboard's Budgets are (v1-spec "Budgets").
    overspent: {
      months: budgeted.filter(({ total, budget }) => budgetProgress(total, budget!).overspent).length,
      of: budgeted.length,
    },
  }
}
