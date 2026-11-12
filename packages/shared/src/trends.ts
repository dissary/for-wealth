import { z } from 'zod'
import type { CurrencyCode } from './currency.js'
import { addMonths, type CalendarMonth, firstDayOf, isCalendarMonth, monthOf, todayIn } from './dates.js'
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
