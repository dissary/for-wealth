import { describe, expect, it } from 'vitest'
import { formatPeriodLabel, latestDate, periodRange, stepMonth, stepPeriod, todayIn } from '../src/index.js'

describe('periodRange', () => {
  describe('week', () => {
    // Weeks start on Monday (v1-spec "Dates and time").
    it('runs Monday to Sunday across the end of a month', () => {
      expect(periodRange('week', '2026-10-29')).toEqual({ from: '2026-10-26', to: '2026-11-01' })
    })

    it('runs Monday to Sunday across the end of a year', () => {
      expect(periodRange('week', '2026-01-01')).toEqual({ from: '2025-12-29', to: '2026-01-04' })
    })

    it('holds its own Monday and Sunday', () => {
      expect(periodRange('week', '2026-10-26')).toEqual({ from: '2026-10-26', to: '2026-11-01' })
      expect(periodRange('week', '2026-11-01')).toEqual({ from: '2026-10-26', to: '2026-11-01' })
    })
  })

  describe('month', () => {
    it.each([
      ['2026-02-14', '2026-02-28'],
      ['2028-02-14', '2028-02-29'],
      ['2000-02-14', '2000-02-29'],
      ['2100-02-14', '2100-02-28'],
    ])('runs to the last day of February for %s', (date, last) => {
      expect(periodRange('month', date)).toEqual({ from: `${date.slice(0, 8)}01`, to: last })
    })

    it('follows the calendar', () => {
      expect(periodRange('month', '2026-12-31')).toEqual({ from: '2026-12-01', to: '2026-12-31' })
    })
  })

  it('is the date itself for a day', () => {
    expect(periodRange('day', '2026-10-22')).toEqual({ from: '2026-10-22', to: '2026-10-22' })
  })

  // "This week" and "this month" are taken in the user's zone, never UTC's.
  describe('near midnight', () => {
    // 00:30 on Mon 2 Nov in Kuala Lumpur (UTC+8) is still Sun 1 Nov in UTC.
    const KL_MONDAY = new Date('2026-11-01T16:30:00Z')
    // 23:30 on Sat 31 Oct in New York (UTC−4) is already Sun 1 Nov in UTC.
    const NY_SATURDAY = new Date('2026-11-01T03:30:00Z')

    it('starts the new week and month in a zone ahead of UTC', () => {
      const today = todayIn('Asia/Kuala_Lumpur', KL_MONDAY)

      expect(periodRange('week', today)).toEqual({ from: '2026-11-02', to: '2026-11-08' })
      expect(periodRange('month', today)).toEqual({ from: '2026-11-01', to: '2026-11-30' })
    })

    it('stays in the old month in a zone behind UTC', () => {
      const today = todayIn('America/New_York', NY_SATURDAY)

      expect(periodRange('week', today)).toEqual({ from: '2026-10-26', to: '2026-11-01' })
      expect(periodRange('month', today)).toEqual({ from: '2026-10-01', to: '2026-10-31' })
    })
  })
})

describe('stepPeriod', () => {
  const BOUNDS = { earliest: '2000-01-01', latest: '2027-10-22' }

  it.each([
    ['day', '2026-03-01', -1, '2026-02-28'],
    ['day', '2026-12-31', 1, '2027-01-01'],
    ['week', '2026-10-22', -1, '2026-10-15'],
    ['week', '2026-12-31', 1, '2027-01-07'],
    ['month', '2026-10-22', 1, '2026-11-22'],
    // A day the next month doesn't have falls back to its last day.
    ['month', '2026-01-31', 1, '2026-02-28'],
    ['month', '2026-03-31', -1, '2026-02-28'],
    ['month', '2026-12-15', 1, '2027-01-15'],
  ] as const)('steps a %s from %s by %i to %s', (period, date, direction, expected) => {
    expect(stepPeriod(period, date, direction, BOUNDS)).toBe(expected)
  })

  it('stops at the Period holding 1 Jan 2000', () => {
    expect(stepPeriod('day', '2000-01-01', -1, BOUNDS)).toBeNull()
    // Mon 27 Dec 1999 to Sun 2 Jan 2000.
    expect(stepPeriod('week', '2000-01-02', -1, BOUNDS)).toBeNull()
    expect(stepPeriod('month', '2000-01-31', -1, BOUNDS)).toBeNull()
  })

  it('stops at the Period holding one year after today', () => {
    expect(stepPeriod('day', '2027-10-22', 1, BOUNDS)).toBeNull()
    expect(stepPeriod('week', '2027-10-18', 1, BOUNDS)).toBeNull()
    expect(stepPeriod('month', '2027-10-01', 1, BOUNDS)).toBeNull()
  })

  // The Period still starts or ends inside the bounds, so it is shown, from
  // the date that is.
  it('lands on the bound when the step would pass it', () => {
    expect(stepPeriod('week', '2000-01-05', -1, BOUNDS)).toBe('2000-01-01')
    expect(stepPeriod('week', '2027-10-14', 1, BOUNDS)).toBe('2027-10-21')
    expect(stepPeriod('week', '2027-10-15', 1, BOUNDS)).toBe('2027-10-22')
    expect(stepPeriod('month', '2027-09-30', 1, BOUNDS)).toBe('2027-10-22')
  })
})

describe('stepMonth', () => {
  const BOUNDS = { earliest: '2000-01-01', latest: '2027-10-22' }

  it.each([
    ['2026-10', -1, '2026-09'],
    ['2026-10', 1, '2026-11'],
    ['2026-12', 1, '2027-01'],
    ['2026-01', -1, '2025-12'],
  ] as const)('steps %s by %i to %s', (month, direction, expected) => {
    expect(stepMonth(month, direction, BOUNDS)).toBe(expected)
  })

  it('stops at the month holding 1 Jan 2000', () => {
    expect(stepMonth('2000-02', -1, BOUNDS)).toBe('2000-01')
    expect(stepMonth('2000-01', -1, BOUNDS)).toBeNull()
  })

  it('stops at the month holding one year after today', () => {
    expect(stepMonth('2027-09', 1, BOUNDS)).toBe('2027-10')
    expect(stepMonth('2027-10', 1, BOUNDS)).toBeNull()
  })

  // The last month moves on with today, which is taken in the user's zone.
  describe('near midnight on the 1st', () => {
    // 00:30 on 1 Nov in Kuala Lumpur (UTC+8) is still 31 Oct in UTC.
    const KL_FIRST = new Date('2026-10-31T16:30:00Z')
    // 23:30 on 31 Oct in New York (UTC−4) is already 1 Nov in UTC.
    const NY_LAST = new Date('2026-11-01T03:30:00Z')
    const boundsIn = (timeZone: string, now: Date) => ({ earliest: '2000-01-01', latest: latestDate(timeZone, now) })

    it('opens the next month in a zone ahead of UTC', () => {
      expect(stepMonth('2027-10', 1, boundsIn('Asia/Kuala_Lumpur', KL_FIRST))).toBe('2027-11')
    })

    it('keeps the last month in a zone behind UTC', () => {
      expect(stepMonth('2027-10', 1, boundsIn('America/New_York', NY_LAST))).toBeNull()
    })
  })
})

describe('formatPeriodLabel', () => {
  it.each([
    ['day', '2026-10-21', 'Wed, 21 Oct 2026'],
    ['week', '2026-10-22', '19–25 Oct 2026'],
    // Intl sets the dash between thin spaces when the months differ.
    ['week', '2026-10-29', '26 Oct – 1 Nov 2026'],
    ['week', '2026-01-01', '29 Dec 2025 – 4 Jan 2026'],
    ['month', '2026-10-22', 'October 2026'],
  ] as const)('labels a %s holding %s as %s', (period, date, label) => {
    expect(formatPeriodLabel(period, date)).toBe(label)
  })
})
