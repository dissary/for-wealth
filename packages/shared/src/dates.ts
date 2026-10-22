// A calendar date with no time or zone, as "2026-10-22". A Transaction's date
// is one. Strings in this form sort in date order, so they compare with < and >.
export type CalendarDate = string

const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

// True for a real date in "YYYY-MM-DD" form; "2026-02-30" isn't one.
export function isCalendarDate(value: string): value is CalendarDate {
  const match = CALENDAR_DATE.exec(value)
  if (!match) return false
  const [year, month, day] = match.slice(1).map(Number) as [number, number, number]
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

const todayFormatters = new Map<string, Intl.DateTimeFormat>()

// Today's date in the given IANA time zone, which for the user is their own
// zone, never the server's or the device's.
export function todayIn(timeZone: string, now: Date = new Date()): CalendarDate {
  let formatter = todayFormatters.get(timeZone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    todayFormatters.set(timeZone, formatter)
  }
  const parts = Object.fromEntries(formatter.formatToParts(now).map((p) => [p.type, p.value]))
  return `${parts.year}-${parts.month}-${parts.day}`
}

// The same day `years` later. 29 Feb falls back to 28 Feb in a year without one.
export function addYears(date: CalendarDate, years: number): CalendarDate {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number]
  const lastDayOfMonth = new Date(Date.UTC(year + years, month, 0)).getUTCDate()
  return toCalendarDate(year + years, month, Math.min(day, lastDayOfMonth))
}

function toCalendarDate(year: number, month: number, day: number): CalendarDate {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

const dayLabel = new Intl.DateTimeFormat('en-MY', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

// "Thu, 22 Oct 2026", in English (Malaysia), the one format for everyone in v1.
// Read and formatted in UTC, so the device's zone can't move it a day.
export function formatDayLabel(date: CalendarDate): string {
  return dayLabel.format(new Date(`${date}T00:00:00Z`))
}
