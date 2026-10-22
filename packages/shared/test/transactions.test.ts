import { describe, expect, it } from 'vitest'
import { MAX_AMOUNT, newTransactionSchema } from '../src/index.js'

// 9 a.m. on Thu 22 Oct 2026 in Kuala Lumpur.
const NOW = new Date('2026-10-22T01:00:00Z')
const ZONE = 'Asia/Kuala_Lumpur'

const VALID = {
  categoryId: '6f1c1e0a-3b7d-4c55-9a1e-2f4b8c9d0e1f',
  amount: 1250,
  date: '2026-10-22',
  note: 'Lunch',
}

function parse(changes: Record<string, unknown>, timeZone = ZONE, now = NOW) {
  return newTransactionSchema(timeZone, now).safeParse({ ...VALID, ...changes })
}

function messageFor(changes: Record<string, unknown>, timeZone = ZONE, now = NOW) {
  const result = parse(changes, timeZone, now)
  return result.success ? undefined : result.error.issues[0]?.message
}

describe('newTransactionSchema', () => {
  it('accepts a valid Transaction', () => {
    expect(parse({}).data).toEqual(VALID)
  })

  describe('amount', () => {
    it.each([1, MAX_AMOUNT])('accepts %i minor units', (amount) => {
      expect(parse({ amount }).success).toBe(true)
    })

    it.each([0, -1, MAX_AMOUNT + 1, 12.5, '1250', null])('refuses %j', (amount) => {
      expect(parse({ amount }).success).toBe(false)
    })
  })

  describe('date', () => {
    it('accepts 1 Jan 2000', () => {
      expect(parse({ date: '2000-01-01' }).success).toBe(true)
    })

    it('refuses a date before 2000', () => {
      expect(messageFor({ date: '1999-12-31' })).toBe('Use a date from Sat, 1 Jan 2000')
    })

    it('accepts one year after today, and refuses the day after', () => {
      expect(parse({ date: '2027-10-22' }).success).toBe(true)
      expect(messageFor({ date: '2027-10-23' })).toBe('Use a date up to Fri, 22 Oct 2027')
    })

    // 00:30 on the 23rd in Kuala Lumpur, but 22:00 on the 22nd in New York.
    it('takes today in the user’s time zone', () => {
      const now = new Date('2026-10-22T16:30:00Z')

      expect(parse({ date: '2027-10-23' }, 'Asia/Kuala_Lumpur', now).success).toBe(true)
      expect(parse({ date: '2027-10-23' }, 'America/New_York', now).success).toBe(false)
    })

    it('falls back to 28 Feb a year after a 29 Feb', () => {
      const leapDay = new Date('2028-02-29T04:00:00Z')

      expect(parse({ date: '2029-02-28' }, ZONE, leapDay).success).toBe(true)
      expect(parse({ date: '2029-03-01' }, ZONE, leapDay).success).toBe(false)
    })

    it.each(['2026-02-30', '2026-13-01', '22/10/2026', '2026-10-22T00:00', '', 20261022])(
      'refuses %j as not a date',
      (date) => {
        expect(messageFor({ date })).toBe('Enter a date')
      },
    )
  })

  describe('note', () => {
    it('is trimmed', () => {
      expect(parse({ note: '  Lunch with Mei  ' }).data?.note).toBe('Lunch with Mei')
    })

    it.each(['', '   ', null, undefined])('stores %j as no note', (note) => {
      expect(parse({ note }).data?.note).toBeNull()
    })

    it('accepts 200 characters, counted after trimming', () => {
      expect(parse({ note: ` ${'a'.repeat(200)} ` }).success).toBe(true)
    })

    it('refuses 201 characters', () => {
      expect(messageFor({ note: 'a'.repeat(201) })).toBe('Use 200 characters or fewer')
    })
  })

  it('refuses a Category ID that is not a UUID', () => {
    expect(messageFor({ categoryId: 'food' })).toBe('Choose a Category')
  })
})
