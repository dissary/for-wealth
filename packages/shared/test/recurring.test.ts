import { describe, expect, it } from 'vitest'
import {
  dueDateAfter,
  dueDatesBetween,
  firstDueDateFrom,
  formatSchedule,
  newRecurringSchema,
  nextDueDateAfterChange,
  ordinal,
  recurringChangesSchema,
  sameSchedule,
  scheduleSchema,
} from '../src/index.js'

const MONTHLY_1 = { frequency: 'monthly', day: 1 } as const
const MONTHLY_5 = { frequency: 'monthly', day: 5 } as const
const MONTHLY_31 = { frequency: 'monthly', day: 31 } as const
const MONDAYS = { frequency: 'weekly', weekday: 1 } as const
const FRIDAYS = { frequency: 'weekly', weekday: 5 } as const
const LEAP_DAY = { frequency: 'yearly', month: 2, day: 29 } as const

describe('firstDueDateFrom', () => {
  it('is the day itself when it is a Due Date', () => {
    expect(firstDueDateFrom(MONTHLY_5, '2026-11-05')).toBe('2026-11-05')
    expect(firstDueDateFrom(MONDAYS, '2026-11-02')).toBe('2026-11-02')
    expect(firstDueDateFrom(LEAP_DAY, '2028-02-29')).toBe('2028-02-29')
  })

  it('moves to the next month once this month’s day has passed', () => {
    expect(firstDueDateFrom(MONTHLY_5, '2026-11-06')).toBe('2026-12-05')
    expect(firstDueDateFrom(MONTHLY_5, '2026-12-06')).toBe('2027-01-05')
  })

  // 2 Nov 2026 is a Monday.
  it('finds the next weekday', () => {
    expect(firstDueDateFrom(FRIDAYS, '2026-11-02')).toBe('2026-11-06')
    expect(firstDueDateFrom(MONDAYS, '2026-11-03')).toBe('2026-11-09')
    expect(firstDueDateFrom({ frequency: 'weekly', weekday: 7 }, '2026-11-02')).toBe('2026-11-08')
  })

  // v1-spec: day 31 in a shorter month falls back to that month's last day.
  it('falls back to the last day of a shorter month', () => {
    expect(firstDueDateFrom(MONTHLY_31, '2026-04-01')).toBe('2026-04-30')
    expect(firstDueDateFrom(MONTHLY_31, '2026-02-01')).toBe('2026-02-28')
    expect(firstDueDateFrom(MONTHLY_31, '2028-02-01')).toBe('2028-02-29')
  })

  it('falls back to 28 Feb in a year without 29 Feb', () => {
    expect(firstDueDateFrom(LEAP_DAY, '2026-01-10')).toBe('2026-02-28')
    expect(firstDueDateFrom(LEAP_DAY, '2026-03-01')).toBe('2027-02-28')
    expect(firstDueDateFrom(LEAP_DAY, '2027-03-01')).toBe('2028-02-29')
  })
})

describe('dueDateAfter', () => {
  it('goes back to day 31 after a shorter month', () => {
    expect(dueDateAfter(MONTHLY_31, '2026-02-28')).toBe('2026-03-31')
    expect(dueDateAfter(MONTHLY_31, '2026-03-31')).toBe('2026-04-30')
  })

  it('is a week later for a weekly schedule', () => {
    expect(dueDateAfter(MONDAYS, '2026-12-28')).toBe('2027-01-04')
  })

  it('is a year later for a yearly schedule', () => {
    expect(dueDateAfter({ frequency: 'yearly', month: 12, day: 25 }, '2026-12-25')).toBe('2027-12-25')
  })
})

describe('dueDatesBetween', () => {
  it('lists every Due Date in the range, both ends included', () => {
    expect(dueDatesBetween(MONDAYS, '2026-11-01', '2026-11-30')).toEqual([
      '2026-11-02',
      '2026-11-09',
      '2026-11-16',
      '2026-11-23',
      '2026-11-30',
    ])
  })

  it('has one for a monthly schedule in each month', () => {
    expect(dueDatesBetween(MONTHLY_31, '2026-01-01', '2026-04-30')).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ])
  })

  // v1-spec: yearly items count only in the month they're due.
  it('has a yearly Due Date only in its own month', () => {
    const insurance = { frequency: 'yearly', month: 3, day: 15 } as const
    expect(dueDatesBetween(insurance, '2026-02-01', '2026-02-28')).toEqual([])
    expect(dueDatesBetween(insurance, '2026-03-01', '2026-03-31')).toEqual(['2026-03-15'])
  })

  it('is empty when the range ends before the first Due Date', () => {
    expect(dueDatesBetween(MONTHLY_5, '2026-11-06', '2026-11-30')).toEqual([])
  })
})

describe('nextDueDateAfterChange', () => {
  // v1-spec: rent created on 1 Nov and moved to the 5th on 3 Nov is next due
  // on 5 Dec, never a second time in November.
  it('never gives a period that already has a Transaction a second one', () => {
    expect(
      nextDueDateAfterChange({
        from: MONTHLY_1,
        to: MONTHLY_5,
        lastDueDate: '2026-11-01',
        startDate: '2026-10-01',
        today: '2026-11-03',
      }),
    ).toBe('2026-12-05')
  })

  // Monday 2 Nov was created, so Friday 6 Nov, in the same week, is skipped.
  it('counts periods under the old schedule', () => {
    expect(
      nextDueDateAfterChange({
        from: MONDAYS,
        to: FRIDAYS,
        lastDueDate: '2026-11-02',
        startDate: '2026-10-05',
        today: '2026-11-03',
      }),
    ).toBe('2026-11-13')
  })

  it('never goes before today', () => {
    expect(
      nextDueDateAfterChange({
        from: { frequency: 'monthly', day: 25 },
        to: MONTHLY_1,
        lastDueDate: '2026-10-25',
        startDate: '2026-09-25',
        today: '2026-11-03',
      }),
    ).toBe('2026-12-01')
  })

  // A wrong day fixed before anything was created takes effect from today.
  it('starts from the start date or today when nothing has been created', () => {
    const change = {
      from: { frequency: 'monthly', day: 25 },
      to: { frequency: 'monthly', day: 10 },
      lastDueDate: null,
    } as const
    expect(nextDueDateAfterChange({ ...change, startDate: '2026-11-03', today: '2026-11-03' })).toBe('2026-11-10')
    expect(nextDueDateAfterChange({ ...change, startDate: '2027-01-01', today: '2026-11-03' })).toBe('2027-01-10')
  })

  it('moves a yearly one to the next year once this year’s is created', () => {
    expect(
      nextDueDateAfterChange({
        from: { frequency: 'yearly', month: 3, day: 15 },
        to: { frequency: 'yearly', month: 11, day: 20 },
        lastDueDate: '2026-03-15',
        startDate: '2026-03-01',
        today: '2026-11-03',
      }),
    ).toBe('2027-11-20')
  })
})

describe('sameSchedule', () => {
  it('compares frequency and its fields', () => {
    expect(sameSchedule(MONTHLY_5, { frequency: 'monthly', day: 5 })).toBe(true)
    expect(sameSchedule(MONTHLY_5, MONTHLY_1)).toBe(false)
    expect(sameSchedule(MONTHLY_5, { frequency: 'yearly', month: 1, day: 5 })).toBe(false)
  })
})

describe('scheduleSchema', () => {
  it('takes each frequency with its own fields', () => {
    expect(scheduleSchema.safeParse(MONTHLY_31).success).toBe(true)
    expect(scheduleSchema.safeParse(MONDAYS).success).toBe(true)
    expect(scheduleSchema.safeParse(LEAP_DAY).success).toBe(true)
  })

  it('refuses a day or weekday out of range', () => {
    expect(scheduleSchema.safeParse({ frequency: 'monthly', day: 0 }).success).toBe(false)
    expect(scheduleSchema.safeParse({ frequency: 'monthly', day: 32 }).success).toBe(false)
    expect(scheduleSchema.safeParse({ frequency: 'monthly', day: 1.5 }).success).toBe(false)
    expect(scheduleSchema.safeParse({ frequency: 'weekly', weekday: 8 }).success).toBe(false)
    expect(scheduleSchema.safeParse({ frequency: 'yearly', month: 13, day: 1 }).success).toBe(false)
  })

  it('refuses a day the month never has', () => {
    expect(scheduleSchema.safeParse({ frequency: 'yearly', month: 2, day: 30 }).success).toBe(false)
    expect(scheduleSchema.safeParse({ frequency: 'yearly', month: 4, day: 31 }).success).toBe(false)
  })

  it('refuses an unknown frequency', () => {
    expect(scheduleSchema.safeParse({ frequency: 'daily' }).success).toBe(false)
  })
})

describe('newRecurringSchema', () => {
  // 03:00 on 3 Nov in Kuala Lumpur is still 2 Nov in UTC.
  const now = new Date('2026-11-02T19:00:00Z')
  const schema = newRecurringSchema('Asia/Kuala_Lumpur', now)
  const valid = {
    categoryId: '3f1d2c4b-5a69-4f7e-8d90-1a2b3c4d5e6f',
    amount: 150_000,
    note: ' Rent ',
    varies: false,
    schedule: MONTHLY_1,
    startDate: '2026-11-03',
  }

  it('takes today in the user’s time zone as the earliest start', () => {
    expect(schema.parse(valid)).toEqual({ ...valid, note: 'Rent' })
    expect(schema.safeParse({ ...valid, startDate: '2026-11-02' }).success).toBe(false)
  })

  it('takes up to one year after today', () => {
    expect(schema.safeParse({ ...valid, startDate: '2027-11-03' }).success).toBe(true)
    expect(schema.safeParse({ ...valid, startDate: '2027-11-04' }).success).toBe(false)
  })

  it('refuses an amount outside a Transaction’s bounds', () => {
    expect(schema.safeParse({ ...valid, amount: 0 }).success).toBe(false)
    expect(schema.safeParse({ ...valid, amount: 12.5 }).success).toBe(false)
  })

  it('needs to know whether the amount varies', () => {
    expect(schema.safeParse({ ...valid, varies: undefined }).success).toBe(false)
  })
})

describe('recurringChangesSchema', () => {
  it('takes any of the fields but the start date', () => {
    expect(recurringChangesSchema.parse({ amount: 100 })).toEqual({ amount: 100 })
    expect(recurringChangesSchema.parse({ note: '' })).toEqual({ note: null })
    expect(recurringChangesSchema.parse({ startDate: '2026-11-03' })).toEqual({})
  })
})

describe('formatSchedule', () => {
  it('says how often it’s due', () => {
    expect(formatSchedule({ frequency: 'monthly', day: 25 })).toBe('Every month on the 25th')
    expect(formatSchedule(MONDAYS)).toBe('Every Monday')
    expect(formatSchedule(LEAP_DAY)).toBe('Every year on 29 Feb')
  })
})

describe('ordinal', () => {
  it('uses the English endings', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 31].map(ordinal)).toEqual([
      '1st',
      '2nd',
      '3rd',
      '4th',
      '11th',
      '12th',
      '13th',
      '21st',
      '22nd',
      '23rd',
      '31st',
    ])
  })
})
