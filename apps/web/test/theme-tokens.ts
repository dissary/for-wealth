import { readFileSync } from 'node:fs'

// Reads the theme's colour tokens from src/index.css so tests check the
// colours the app actually ships, in light and dark mode.

export const themeCss = readFileSync(
  new URL('../src/index.css', import.meta.url),
  'utf8',
)

export interface Oklch {
  l: number
  c: number
  h: number
  alpha: number
}

export type Mode = 'light' | 'dark'

const DARK_MEDIA = /@media \(prefers-color-scheme: dark\)\s*\{/

// Tokens on :root that aren't colours. Every other token must be written as
// oklch(), so no colour can slip past the checks in another notation.
const NON_COLOUR_TOKENS = new Set(['radius'])

// Every colour token defined on :root for the given mode.
export function themeColours(mode: Mode): Map<string, Oklch> {
  const darkStart = themeCss.search(DARK_MEDIA)
  if (darkStart === -1) throw new Error('index.css has no dark-mode @media block')

  const colours = new Map<string, Oklch>()
  for (const block of themeCss.matchAll(/:root\s*\{([^}]*)\}/g)) {
    const isDark = block.index > darkStart
    // Dark mode starts from the light tokens and overrides them.
    if (isDark && mode === 'light') continue
    for (const [, name, value] of block[1].matchAll(/--([\w-]+):\s*([^;]+);/g)) {
      if (NON_COLOUR_TOKENS.has(name)) continue
      colours.set(name, parseOklch(value.trim()))
    }
  }
  return colours
}

export function parseOklch(value: string): Oklch {
  const match = value.match(
    /^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+)(%?))?\s*\)$/,
  )
  if (!match) throw new Error(`Write theme colours as oklch(L C H [/ A]), not: ${value}`)
  const [, l, lPercent, c, h, alpha, alphaPercent] = match
  return {
    l: Number(l) / (lPercent ? 100 : 1),
    c: Number(c),
    h: Number(h),
    alpha: alpha === undefined ? 1 : Number(alpha) / (alphaPercent ? 100 : 1),
  }
}

// Linear-light sRGB channels (0–1 when the colour is in gamut).
export function toLinearSrgb({ l, c, h }: Oklch): [number, number, number] {
  // OKLab to linear sRGB, from Björn Ottosson's reference implementation:
  // https://bottosson.github.io/posts/oklab/
  const a = c * Math.cos((h * Math.PI) / 180)
  const b = c * Math.sin((h * Math.PI) / 180)
  const lc = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const mc = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const sc = (l - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    4.0767416621 * lc - 3.3077115913 * mc + 0.2309699292 * sc,
    -1.2684380046 * lc + 2.6097574011 * mc - 0.3413193965 * sc,
    -0.0041960863 * lc - 0.7034186147 * mc + 1.707614701 * sc,
  ]
}

export function isInSrgbGamut(colour: Oklch): boolean {
  const tolerance = 0.001
  return toLinearSrgb(colour).every((v) => v >= -tolerance && v <= 1 + tolerance)
}

// WCAG 2.2 contrast ratio between two opaque colours.
export function contrastRatio(a: Oklch, b: Oklch): number {
  const luminance = (colour: Oklch) => {
    const [r, g, bl] = toLinearSrgb(colour).map((v) => Math.min(Math.max(v, 0), 1))
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl
  }
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}
