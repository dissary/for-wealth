import { describe, expect, it } from 'vitest'
import { formatShare } from '../src/index.js'

describe('formatShare', () => {
  it('is a whole percentage of the month’s Expenses', () => {
    expect(formatShare(82_000, 241_176)).toBe('34%')
  })

  it('rounds halves up', () => {
    expect(formatShare(1, 8)).toBe('13%')
    expect(formatShare(5, 200)).toBe('3%')
  })

  // v1-spec "The Dashboard": a share under 1% never shows as "0%".
  it('shows "<1%" for a share that rounds to nothing', () => {
    expect(formatShare(1, 1_000)).toBe('<1%')
    expect(formatShare(4, 1_000)).toBe('<1%')
  })

  it('shows 1% from half a percent', () => {
    expect(formatShare(5, 1_000)).toBe('1%')
  })

  it('is 100% for the only Category', () => {
    expect(formatShare(1_250, 1_250)).toBe('100%')
  })

  // Nothing adjusts rounded shares to add up to 100%.
  it('rounds each share on its own', () => {
    expect([1, 1, 1].map((total) => formatShare(total, 3))).toEqual(['33%', '33%', '33%'])
  })

  it('refuses a month with no Expenses', () => {
    expect(() => formatShare(0, 0)).toThrow()
  })

  it('is exact for the largest totals', () => {
    expect(formatShare(100_000_000_000 * 1_000, 100_000_000_000 * 3_000)).toBe('33%')
  })
})
