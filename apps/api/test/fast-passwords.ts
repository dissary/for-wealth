import { createHash, randomBytes } from 'node:crypto'
import { beforeEach } from 'vitest'
import { passwordHashing } from '../src/password-hashing.js'

// Runs before every test file (vitest.config.ts → setupFiles). Nearly every
// test signs a user up and in, and the real scrypt hash made those the bulk
// of the suite's time. Before each test, passwords get a salted SHA-256
// instead: fast, and still never stored as typed. A test that needs the real
// hash calls passwordHashing.reset().

function sha256(text: string) {
  return createHash('sha256').update(text).digest('hex')
}

beforeEach(() => {
  passwordHashing.hash = async (password) => {
    const salt = randomBytes(16).toString('hex')
    return `${salt}:${sha256(salt + password)}`
  }
  passwordHashing.verify = async ({ hash, password }) => {
    const [salt, digest] = hash.split(':')
    return digest === sha256(salt + password)
  }
})
