import { describe, expect, it } from 'vitest'
import { signUpSchema } from '../src/index.js'

const valid = {
  name: 'Aisyah',
  email: 'aisyah@example.com',
  password: 'twelve chars',
  currency: 'MYR',
  timeZone: 'Asia/Kuala_Lumpur',
}

function issuesFor(input: Record<string, unknown>) {
  const result = signUpSchema.safeParse(input)
  return result.success ? [] : result.error.issues.map((i) => i.path.join('.'))
}

describe('signUpSchema', () => {
  it('accepts a complete signup', () => {
    expect(signUpSchema.parse(valid)).toEqual(valid)
  })

  it('trims the name', () => {
    expect(signUpSchema.parse({ ...valid, name: '  Aisyah ' }).name).toBe('Aisyah')
  })

  it.each(['', '   '])('rejects the blank name %j', (name) => {
    expect(issuesFor({ ...valid, name })).toEqual(['name'])
  })

  it('accepts a 100-character name and rejects 101', () => {
    expect(issuesFor({ ...valid, name: 'a'.repeat(100) })).toEqual([])
    expect(issuesFor({ ...valid, name: 'a'.repeat(101) })).toEqual(['name'])
  })

  it('rejects an invalid email', () => {
    expect(issuesFor({ ...valid, email: 'aisyah' })).toEqual(['email'])
  })

  describe('password', () => {
    it('rejects 11 characters', () => {
      expect(issuesFor({ ...valid, password: 'a'.repeat(11) })).toEqual(['password'])
    })

    it('accepts 12 and 128 characters', () => {
      expect(issuesFor({ ...valid, password: 'a'.repeat(12) })).toEqual([])
      expect(issuesFor({ ...valid, password: 'a'.repeat(128) })).toEqual([])
    })

    it('rejects 129 characters', () => {
      expect(issuesFor({ ...valid, password: 'a'.repeat(129) })).toEqual(['password'])
    })

    it('has no character-type rules', () => {
      expect(issuesFor({ ...valid, password: 'all lowercase words' })).toEqual([])
    })
  })

  it('rejects an unlisted currency', () => {
    expect(issuesFor({ ...valid, currency: 'KWD' })).toEqual(['currency'])
  })

  it('rejects an unknown time zone', () => {
    expect(issuesFor({ ...valid, timeZone: 'Mars/Olympus_Mons' })).toEqual(['timeZone'])
  })
})
