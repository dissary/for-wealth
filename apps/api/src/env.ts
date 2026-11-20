import { z } from 'zod'

const envSchema = z.object({
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  // No default: Better Auth would otherwise fall back to its built-in secret.
  BETTER_AUTH_SECRET: z.string().min(32),
  // The address the browser uses: the Vite dev server in development, the
  // public URL in production. Email links and cookies are built from it.
  BETTER_AUTH_URL: z.url({ protocol: /^https?$/ }),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  // "false" refuses every sign-up. Production sets it once its accounts
  // exist, so a stranger who finds the address can't make one.
  ALLOW_SIGN_UP: z.stringbool().default(true),
  // The built web app (apps/web/dist). Set in production, where the API
  // serves it on the same address; unset in development, where Vite does.
  WEB_DIST_DIR: z.string().min(1).optional(),
})

export type Env = z.infer<typeof envSchema>

export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source)
  if (!result.success) {
    throw new Error(`Invalid environment:\n${z.prettifyError(result.error)}`)
  }
  return result.data
}

// Checked on import, so the API refuses to start with a bad environment.
export const env = parseEnv(process.env)
