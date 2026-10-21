import { describe, expect, it } from 'vitest'
import { parseEnv } from '../src/env.js'

const valid = {
  DATABASE_URL: 'postgres://for_wealth:for_wealth@localhost:5432/for_wealth',
  BETTER_AUTH_SECRET: 'a'.repeat(32),
}

describe('parseEnv', () => {
  it('accepts a valid environment, with the port defaulting to 3000', () => {
    expect(parseEnv(valid)).toEqual({ ...valid, PORT: 3000 })
  })

  it('reads the port as a number', () => {
    expect(parseEnv({ ...valid, PORT: '4000' }).PORT).toBe(4000)
  })

  it('refuses to start without an auth secret', () => {
    expect(() => parseEnv({ DATABASE_URL: valid.DATABASE_URL })).toThrow(
      /BETTER_AUTH_SECRET/,
    )
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
    expect(() =>
      parseEnv({ BETTER_AUTH_SECRET: valid.BETTER_AUTH_SECRET }),
    ).toThrow(/DATABASE_URL/)
  })

  it('refuses a database URL that is not Postgres', () => {
    expect(() =>
      parseEnv({ ...valid, DATABASE_URL: 'mysql://localhost:3306/for_wealth' }),
    ).toThrow(/DATABASE_URL/)
  })
})
