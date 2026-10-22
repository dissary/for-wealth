import { describe, expect, it } from 'vitest'
import { formatDayLabel, todayIn } from '../src/index.js'

describe('todayIn', () => {
  // 00:30 on the 23rd in Kuala Lumpur (UTC+8) is still the 22nd in UTC.
  it('is the date in a time zone ahead of UTC', () => {
    expect(todayIn('Asia/Kuala_Lumpur', new Date('2026-10-22T16:30:00Z'))).toBe('2026-10-23')
  })

  // 22:00 on the 22nd in New York (UTC−4 in October) is already the 23rd in UTC.
  it('is the date in a time zone behind UTC', () => {
    expect(todayIn('America/New_York', new Date('2026-10-23T02:00:00Z'))).toBe('2026-10-22')
  })
})

describe('formatDayLabel', () => {
  it('reads as English (Malaysia)', () => {
    expect(formatDayLabel('2026-10-22')).toBe('Thu, 22 Oct 2026')
  })

  // The label is for a calendar date, so the device's zone can't shift it.
  it('is the same date whatever the zone', () => {
    expect(formatDayLabel('2000-01-01')).toBe('Sat, 1 Jan 2000')
  })
})
