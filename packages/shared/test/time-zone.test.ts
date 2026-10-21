import { describe, expect, it } from 'vitest'
import { timeZoneSchema } from '../src/index.js'

describe('timeZoneSchema', () => {
  it.each(['Asia/Kuala_Lumpur', 'Europe/London', 'America/New_York', 'UTC'])(
    'accepts %s',
    (zone) => {
      expect(timeZoneSchema.parse(zone)).toBe(zone)
    },
  )

  it('stores the name in its canonical spelling', () => {
    expect(timeZoneSchema.parse('asia/kuala_lumpur')).toBe('Asia/Kuala_Lumpur')
  })

  it.each(['Mars/Olympus_Mons', '', 'Asia/Kuala Lumpur'])(
    'rejects the unknown zone %j',
    (zone) => {
      expect(timeZoneSchema.safeParse(zone).success).toBe(false)
    },
  )

  // A fixed offset has no daylight saving rules, so "today" would be wrong
  // for half the year in most of Europe and America.
  it.each(['+08:00', '-05', '+0800'])('rejects the fixed offset %s', (zone) => {
    expect(timeZoneSchema.safeParse(zone).success).toBe(false)
  })

  it('rejects a value that is not a string', () => {
    expect(timeZoneSchema.safeParse(8).success).toBe(false)
  })
})
