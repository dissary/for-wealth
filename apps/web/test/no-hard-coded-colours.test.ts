import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Components take colours from the theme's tokens (bg-primary,
// text-over-budget, ...), never from Tailwind's palette or a literal colour,
// so the theme alone decides how the app looks.

const SRC = new URL('../src/', import.meta.url)
const GENERATED = new Set(['routeTree.gen.ts'])

const sourceFiles = readdirSync(SRC, { recursive: true, encoding: 'utf8' })
  .filter((path) => /\.(ts|tsx)$/.test(path))
  .filter((path) => !GENERATED.has(path))

const PALETTE_UTILITY =
  /\b(?:bg|text|text-shadow|border|ring|ring-offset|inset-ring|inset-shadow|outline|fill|stroke|from|via|to|decoration|shadow|accent|caret|divide|placeholder)-(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone|black|white)\b/
const COLOUR_LITERAL = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|hwb|oklch|oklab|lch|lab)\(/
// Text sits on primary, and fading it towards the background lowers the
// contrast. shadcn/ui components arrive with hover:bg-primary/80; use
// bg-primary-hover instead.
const FADED_PRIMARY = /\bbg-primary\/\d/

describe.each(sourceFiles)('src/%s', (path) => {
  const source = readFileSync(new URL(path, SRC), 'utf8')

  it('uses no Tailwind palette colours', () => {
    expect(source.match(PALETTE_UTILITY)?.[0]).toBeUndefined()
  })

  it('uses no literal colours', () => {
    expect(source.match(COLOUR_LITERAL)?.[0]).toBeUndefined()
  })

  it('does not fade the primary background', () => {
    expect(source.match(FADED_PRIMARY)?.[0]).toBeUndefined()
  })
})
