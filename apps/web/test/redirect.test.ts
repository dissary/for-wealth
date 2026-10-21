import { describe, expect, it } from 'vitest'
import { pathInsideApp, signInURL } from '../src/lib/redirect.ts'

const ORIGIN = 'http://localhost:5173'

describe('pathInsideApp', () => {
  it('keeps a path inside the app, with its query and fragment', () => {
    expect(pathInsideApp('/transactions?period=week#today', ORIGIN)).toBe(
      '/transactions?period=week#today',
    )
  })

  it.each([undefined, null, 42, ''])('falls back to the home page for %j', (target) => {
    expect(pathInsideApp(target, ORIGIN)).toBe('/')
  })

  // Each of these would take the browser to another site.
  it.each([
    'https://evil.example/sign-in',
    '//evil.example',
    '/\\evil.example',
    '\\\\evil.example',
    '/\t/evil.example',
    '/\n/evil.example',
    'javascript:alert(1)',
    'http://localhost:5173.evil.example/',
    // Parse as this origin, but dot segments normalise to "//evil.example".
    '/.//evil.example',
    '/./\\evil.example',
    '/%2e//evil.example',
    '/..//evil.example',
    '/x/..//evil.example',
  ])('refuses %j', (target) => {
    expect(pathInsideApp(target, ORIGIN)).toBe('/')
  })

  it('refuses a full URL even on this origin, as the app only ever sends paths', () => {
    expect(pathInsideApp(`${ORIGIN}/transactions`, ORIGIN)).toBe('/')
  })
})

describe('signInURL', () => {
  it('is the bare sign-in page when the user was going home', () => {
    expect(signInURL(undefined, ORIGIN)).toBe('/sign-in')
    expect(signInURL('/', ORIGIN)).toBe('/sign-in')
  })

  it('carries the path the user was going to', () => {
    expect(signInURL('/transactions?period=week', ORIGIN)).toBe(
      '/sign-in?redirect=%2Ftransactions%3Fperiod%3Dweek',
    )
  })

  it('drops a target outside the app', () => {
    expect(signInURL('https://evil.example/', ORIGIN)).toBe('/sign-in')
  })
})
