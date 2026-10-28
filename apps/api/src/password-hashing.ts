import { hashPassword, verifyPassword } from 'better-auth/crypto'

// How passwords are hashed and checked: Better Auth's own scrypt, which is
// slow on purpose. Every sign-up and sign-in pays for it, so tests swap in a
// fast hash (test/fast-passwords.ts) and call reset() where they need the
// real one.
export const passwordHashing = {
  hash: hashPassword,
  verify: verifyPassword,
  reset() {
    this.hash = hashPassword
    this.verify = verifyPassword
  },
}
