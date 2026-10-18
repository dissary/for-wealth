# Frontend and API live in one pnpm monorepo

The web app (`apps/web`), the API (`apps/api`) and shared code (`packages/shared`: types, Zod schemas, money and date helpers) live in one pnpm workspace. Both sides are TypeScript and must agree on the same shapes and validation, which separate repos would force us to copy or publish. The separate `for-wealth-api` repo is abandoned.
