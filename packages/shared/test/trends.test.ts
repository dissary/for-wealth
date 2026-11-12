import { describe, expect, it } from 'vitest'
import {
  formatNet,
  formatTrendsWindow,
  stepTrendsWindow,
  trendsMonths,
  trendsScale,
  trendsToSchema,
} from '../src/index.js'

describe('trendsMonths', () => {
  it('is the 12 months ending with `to`, oldest first, across a new year', () => {
    expect(trendsMonths('2026-03', '2020-06')).toEqual([
      '2025-04',
      '2025-05',
      '2025-06',
      '2025-07',
      '2025-08',
      '2025-09',
      '2025-10',
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
      '2026-03',
    ])
  })

  it('starts at the month of the first Transaction in a short first year', () => {
    expect(trendsMonths('2026-11', '2026-09')).toEqual(['2026-09', '2026-10', '2026-11'])
  })

  it('is the full year when the first Transaction is exactly 11 months before `to`', () => {
    expect(trendsMonths('2026-11', '2025-12')).toHaveLength(12)
    expect(trendsMonths('2026-11', '2025-12')[0]).toBe('2025-12')
  })

  it('is one month when the first Transaction is in `to`', () => {
    expect(trendsMonths('2026-11', '2026-11')).toEqual(['2026-11'])
  })

  it('is empty with no Transactions', () => {
    expect(trendsMonths('2026-11', null)).toEqual([])
  })

  it('is empty when the first Transaction is after `to`', () => {
    expect(trendsMonths('2026-11', '2026-12')).toEqual([])
  })
})

describe('stepTrendsWindow', () => {
  const step = (to: string, direction: -1 | 1, first: string | null = '2020-06', thisMonth = '2026-11') =>
    stepTrendsWindow(to, direction, { first, thisMonth })

  describe('‹', () => {
    it('steps back a whole year, across a new year', () => {
      expect(step('2026-03', -1)).toBe('2025-03')
    })

    it('steps back into a short first year', () => {
      // The window ends Nov 2026 and starts Dec 2025; the first Transaction
      // is in Jul 2025, so the year before shows Jul to Nov 2025.
      expect(step('2026-11', -1, '2025-07')).toBe('2025-11')
      // The first Transaction in the month just before the window.
      expect(step('2026-11', -1, '2025-11')).toBe('2025-11')
    })

    it('is off when the window already starts at the first Transaction’s month', () => {
      // A short first year: the window is Sep to Nov 2026.
      expect(step('2026-11', -1, '2026-09')).toBeNull()
      // A first year that's exactly full: Dec 2025 to Nov 2026.
      expect(step('2026-11', -1, '2025-12')).toBeNull()
    })

    it('is off with no Transactions', () => {
      expect(step('2026-11', -1, null)).toBeNull()
    })

    it('is off for a window ending before the first Transaction', () => {
      expect(step('2010-01', -1, '2020-06')).toBeNull()
    })
  })

  describe('›', () => {
    it('steps forward a whole year, across a new year', () => {
      expect(step('2024-12', 1)).toBe('2025-12')
    })

    it('lands exactly on this month a year on', () => {
      expect(step('2025-11', 1)).toBe('2026-11')
    })

    it('stops at this month from a window ending within the last 12 months', () => {
      expect(step('2025-12', 1)).toBe('2026-11')
      expect(step('2026-10', 1)).toBe('2026-11')
    })

    it('is off when the window already ends this month', () => {
      expect(step('2026-11', 1)).toBeNull()
    })

    it('stops at this month across a new year', () => {
      expect(step('2026-06', 1, '2020-06', '2027-01')).toBe('2027-01')
    })
  })
})

describe('formatTrendsWindow', () => {
  it('names the first and last months shown', () => {
    expect(formatTrendsWindow(trendsMonths('2026-11', '2020-06'))).toBe('Dec 2025 \u2013 Nov 2026')
  })

  it('names a short first year from its first month, abbreviated as the columns are', () => {
    expect(formatTrendsWindow(['2026-09', '2026-10', '2026-11'])).toBe('Sept 2026 \u2013 Nov 2026')
  })

  it('names a lone month once', () => {
    expect(formatTrendsWindow(['2026-11'])).toBe('Nov 2026')
  })
})

describe('trendsToSchema', () => {
  // 12:00 on 12 Nov 2026 in Kuala Lumpur.
  const NOW = new Date('2026-11-12T04:00:00Z')
  const allowed = (to: string, timeZone = 'Asia/Kuala_Lumpur', now = NOW) =>
    trendsToSchema(timeZone, now).safeParse(to).success

  it.each(['2026-11', '2026-10', '2000-01'])('allows %s', (to) => {
    expect(allowed(to)).toBe(true)
  })

  it.each([
    ['a month after this one', '2026-12'],
    ['the month before 2000', '1999-12'],
    ['a malformed month', '2026-13'],
    ['a month without its zero', '2026-1'],
    ['a date', '2026-11-01'],
  ])('refuses %s', (_, to) => {
    expect(allowed(to)).toBe(false)
  })

  // This month is taken in the user's zone, so it moves on at their midnight.
  describe('near midnight on the 1st', () => {
    // 00:30 on 1 Nov in Kuala Lumpur (UTC+8) is still 31 Oct in UTC.
    const KL_FIRST = new Date('2026-10-31T16:30:00Z')
    // 23:30 on 31 Oct in New York (UTC−4) is already 1 Nov in UTC.
    const NY_LAST = new Date('2026-11-01T03:30:00Z')

    it('allows the new month in a zone ahead of UTC', () => {
      expect(allowed('2026-11', 'Asia/Kuala_Lumpur', KL_FIRST)).toBe(true)
    })

    it('refuses the new month in a zone behind UTC', () => {
      expect(allowed('2026-11', 'America/New_York', NY_LAST)).toBe(false)
      expect(allowed('2026-10', 'America/New_York', NY_LAST)).toBe(true)
    })
  })
})

describe('formatNet', () => {
  it('carries a plus when Income is larger', () => {
    expect(formatNet(420_000, 'MYR')).toBe('+RM4,200.00')
  })

  it('carries a minus sign when Expenses are larger', () => {
    expect(formatNet(-30_000, 'MYR')).toBe('\u2212RM300.00')
  })

  it('has no sign at zero', () => {
    expect(formatNet(0, 'MYR')).toBe('RM0.00')
  })

  it('uses the currency’s own decimal places', () => {
    expect(formatNet(-1_500, 'JPY')).toBe('\u2212JP¥1,500')
  })
})

describe('trendsScale', () => {
  const labels = (max: number, currency: 'MYR' | 'JPY' = 'MYR') => trendsScale(max, currency).ticks.map((t) => t.label)

  it('tops out at a tidy whole amount at or above the largest, with a tidy half', () => {
    // RM5,500.00 tops out at RM6,000, so the half is RM3,000.
    expect(trendsScale(550_000, 'MYR')).toEqual({
      top: 600_000,
      ticks: [
        { value: 0, label: '0' },
        { value: 300_000, label: '3k' },
        { value: 600_000, label: '6k' },
      ],
    })
  })

  it.each([
    [100_000, ['0', '500', '1k']],
    [100_001, ['0', '1k', '2k']],
    [710_000, ['0', '4k', '8k']],
    [810_000, ['0', '5k', '10k']],
    [4_250_000, ['0', '30k', '60k']],
    [150_000_000, ['0', '1m', '2m']],
  ])('labels a largest of %i sen as %j', (max, expected) => {
    expect(labels(max)).toEqual(expected)
  })

  it('reads whole yen in JPY, which has no decimal places', () => {
    expect(labels(550_000, 'JPY')).toEqual(['0', '300k', '600k'])
  })

  it('still has a scale for tiny amounts and for nothing at all', () => {
    expect(labels(50)).toEqual(['0', '1', '2'])
    expect(labels(0)).toEqual(['0', '1', '2'])
  })
})
