import { z } from 'zod'
import {
  addDays,
  addMonths,
  type CalendarDate,
  daysInMonth,
  formatDayLabel,
  isoWeekday,
  toCalendarDate,
  utcMidnight,
} from './dates.js'

// The windows Transactions are browsed and totalled over. Never an arbitrary
// range (v1-spec "The Transactions page").
export const PERIODS = ['day', 'week', 'month'] as const
export type Period = (typeof PERIODS)[number]

export const periodSchema = z.enum(PERIODS, { error: 'Choose a Day, Week or Month' })

// The first and last date of the Period holding `date`, both included. Weeks
// run Monday to Sunday; months follow the calendar.
export function periodRange(period: Period, date: CalendarDate): { from: CalendarDate; to: CalendarDate } {
  switch (period) {
    case 'day':
      return { from: date, to: date }
    case 'week': {
      const from = addDays(date, 1 - isoWeekday(date))
      return { from, to: addDays(from, 6) }
    }
    case 'month': {
      const [year, month] = date.split('-').map(Number) as [number, number]
      return { from: toCalendarDate(year, month, 1), to: toCalendarDate(year, month, daysInMonth(year, month)) }
    }
  }
}

// The date to show after ‹ (-1) or › (1): the same place in the Period before
// or after, kept inside the bounds a Transaction's date has. Null when that
// Period lies wholly outside them, so ‹ › stop at the Periods holding the
// bounds.
export function stepPeriod(
  period: Period,
  date: CalendarDate,
  direction: -1 | 1,
  bounds: { earliest: CalendarDate; latest: CalendarDate },
): CalendarDate | null {
  const { from, to } = periodRange(period, date)
  if (direction === -1 ? from <= bounds.earliest : to >= bounds.latest) return null

  const stepped =
    period === 'month' ? addMonths(date, direction) : addDays(date, direction * (period === 'week' ? 7 : 1))
  if (stepped < bounds.earliest) return bounds.earliest
  if (stepped > bounds.latest) return bounds.latest
  return stepped
}

// Read and formatted in UTC, like formatDayLabel, so the device's zone can't
// move a date.
const weekLabel = new Intl.DateTimeFormat('en-MY', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})
const monthLabel = new Intl.DateTimeFormat('en-MY', { month: 'long', year: 'numeric', timeZone: 'UTC' })

// The heading for the Period holding `date`: "Thu, 22 Oct 2026",
// "19–25 Oct 2026" or "October 2026".
export function formatPeriodLabel(period: Period, date: CalendarDate): string {
  const { from, to } = periodRange(period, date)
  switch (period) {
    case 'day':
      return formatDayLabel(date)
    case 'week':
      return weekLabel.formatRange(utcMidnight(from), utcMidnight(to))
    case 'month':
      return monthLabel.format(utcMidnight(from))
  }
}
