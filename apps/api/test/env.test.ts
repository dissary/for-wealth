import { describe, expect, it } from 'vitest'
import { parseEnv } from '../src/env.js'

const valid = {
  DATABASE_URL: 'postgres://for_wealth:for_wealth@localhost:5432/for_wealth',
  BETTER_AUTH_SECRET: 'a'.repeat(32),
  BETTER_AUTH_URL: 'http://localhost:5173',
}

describe('parseEnv', () => {
  it('accepts a valid environment, with the port defaulting to 3000 and sign-up open', () => {
    expect(parseEnv(valid)).toEqual({ ...valid, PORT: 3000, ALLOW_SIGN_UP: true })
  })

  it.each([
    ['false', false],
    ['true', true],
  ])('reads ALLOW_SIGN_UP=%s as %s', (value, expected) => {
    expect(parseEnv({ ...valid, ALLOW_SIGN_UP: value }).ALLOW_SIGN_UP).toBe(expected)
  })

  it('refuses an ALLOW_SIGN_UP that is not a yes or no', () => {
    expect(() => parseEnv({ ...valid, ALLOW_SIGN_UP: 'maybe' })).toThrow(/ALLOW_SIGN_UP/)
  })

  it('reads the port as a number', () => {
    expect(parseEnv({ ...valid, PORT: '4000' }).PORT).toBe(4000)
  })

  it('refuses to start without an auth secret', () => {
    const { BETTER_AUTH_SECRET: _, ...rest } = valid
    expect(() => parseEnv(rest)).toThrow(/BETTER_AUTH_SECRET/)
  })

  it('refuses an auth secret shorter than 32 characters', () => {
    expect(() =>
      parseEnv({ ...valid, BETTER_AUTH_SECRET: 'a'.repeat(31) }),
    ).toThrow(/BETTER_AUTH_SECRET/)
  })

  it('does not print the secret it rejects', () => {
    expect(() =>
      parseEnv({ ...valid, BETTER_AUTH_SECRET: 'too-short-but-secret' }),
    ).not.toThrow(/too-short-but-secret/)
  })

  it('refuses to start without a database URL', () => {
    const { DATABASE_URL: _, ...rest } = valid
    expect(() => parseEnv(rest)).toThrow(/DATABASE_URL/)
  })

  it('refuses a database URL that is not Postgres', () => {
    expect(() =>
      parseEnv({ ...valid, DATABASE_URL: 'mysql://localhost:3306/for_wealth' }),
    ).toThrow(/DATABASE_URL/)
  })

  it('refuses to start without the address the browser uses', () => {
    const { BETTER_AUTH_URL: _, ...rest } = valid
    expect(() => parseEnv(rest)).toThrow(/BETTER_AUTH_URL/)
  })

  it.each(['localhost:5173', 'ftp://localhost:5173'])(
    'refuses the auth URL %s',
    (url) => {
      expect(() => parseEnv({ ...valid, BETTER_AUTH_URL: url })).toThrow(
        /BETTER_AUTH_URL/,
      )
    },
  )
})
