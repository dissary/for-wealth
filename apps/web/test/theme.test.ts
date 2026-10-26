import { describe, expect, it } from 'vitest'
import {
  contrastRatio,
  isInSrgbGamut,
  parseOklch,
  themeColours,
  themeCss,
  type Mode,
} from './theme-tokens.ts'

describe('contrast helper', () => {
  // Known values from the WCAG definition: black on white is 21:1, and
  // #767676 (oklch 0.5657 0 0) on white is the classic 4.54:1.
  it('matches known WCAG ratios', () => {
    const white = parseOklch('oklch(1 0 0)')
    expect(contrastRatio(parseOklch('oklch(0 0 0)'), white)).toBeCloseTo(21, 1)
    expect(contrastRatio(parseOklch('oklch(0.5657 0 0)'), white)).toBeCloseTo(4.54, 1)
  })
})

// [text, background] pairs the components put together. Text must meet WCAG
// AA for normal-size text (4.5:1) in both modes.
const TEXT_PAIRS: [string, string][] = [
  ['foreground', 'background'],
  ['card-foreground', 'card'],
  ['popover-foreground', 'popover'],
  ['primary-foreground', 'primary'],
  ['primary-foreground', 'primary-hover'],
  ['primary', 'background'],
  ['primary', 'card'],
  ['secondary-foreground', 'secondary'],
  ['muted-foreground', 'muted'],
  ['muted-foreground', 'background'],
  ['muted-foreground', 'card'],
  ['muted-foreground', 'secondary'],
  ['muted-foreground', 'accent'],
  ['muted-foreground', 'sidebar'],
  ['accent-foreground', 'accent'],
  ['destructive', 'background'],
  ['destructive', 'card'],
  ['over-budget', 'background'],
  ['over-budget', 'card'],
  ['under-budget', 'background'],
  ['under-budget', 'card'],
  ['sidebar-foreground', 'sidebar'],
  ['sidebar-primary', 'sidebar'],
  ['sidebar-primary-foreground', 'sidebar-primary'],
  ['sidebar-accent-foreground', 'sidebar-accent'],
]

// Below this chroma a colour reads as a tinted neutral rather than a hue.
const NEUTRAL_CHROMA = 0.04

// How far (OKLCH degrees) a coloured token may sit from the accent's hue.
const ACCENT_HUE_TOLERANCE = 15

// Hue ranges (OKLCH degrees, clockwise from the first) that read as red and
// as green. Red wraps past 360.
type HueRange = [from: number, to: number]
const RED_HUES: HueRange = [345, 45]
const GREEN_HUES: HueRange = [120, 170]
const inRange = (hue: number, [from, to]: HueRange) =>
  from <= to ? hue >= from && hue <= to : hue >= from || hue <= to

// Shortest distance between two hues on the colour wheel.
const hueDistance = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360
  return Math.min(d, 360 - d)
}

describe.each<Mode>(['light', 'dark'])('%s mode', (mode) => {
  const colours = themeColours(mode)

  it.each([...colours])('--%s is inside the sRGB gamut', (_name, colour) => {
    expect(isInSrgbGamut(colour)).toBe(true)
  })

  it('uses red only for over-Budget and green only for under-Budget', () => {
    expect(inRange(colours.get('over-budget')!.h, RED_HUES)).toBe(true)
    expect(inRange(colours.get('under-budget')!.h, GREEN_HUES)).toBe(true)

    const accentHue = colours.get('primary')!.h
    const offAccent = [...colours]
      .filter(([name]) => name !== 'over-budget' && name !== 'under-budget')
      .filter(([, colour]) => colour.c >= NEUTRAL_CHROMA)
      .filter(([, colour]) => hueDistance(colour.h, accentHue) > ACCENT_HUE_TOLERANCE)
      .map(([name]) => name)
    // Every other coloured token is the one accent colour.
    expect(offAccent).toEqual([])
  })

  it.each(TEXT_PAIRS)('%s on %s meets WCAG AA', (text, background) => {
    const fg = colours.get(text)
    const bg = colours.get(background)
    expect(fg, `--${text} is not defined`).toBeDefined()
    expect(bg, `--${background} is not defined`).toBeDefined()
    expect(fg!.alpha).toBe(1)
    expect(bg!.alpha).toBe(1)
    expect(contrastRatio(fg!, bg!)).toBeGreaterThanOrEqual(4.5)
  })
})

describe('motion', () => {
  // Transitions and the dialog's animations come from many components, so
  // the stylesheet turns them off in one place for anyone who asks the
  // device for less motion.
  it('stops transitions and animations when reduced motion is preferred', () => {
    const block = themeCss.match(/@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/)?.[1]
    expect(block, 'index.css has no reduced-motion @media block').toBeDefined()
    expect(block).toMatch(/transition-duration:\s*0\.01ms\s*!important/)
    expect(block).toMatch(/animation-duration:\s*0\.01ms\s*!important/)
  })
})

describe('fonts', () => {
  // Fonts come from the app's own address. A font CDN would see every
  // visitor's IP address and could serve different files later.
  it('loads nothing from another address', () => {
    expect(themeCss).not.toMatch(/(?:url\(|@import)\s*['"]?(?:https?:)?\/\//)
  })
})
