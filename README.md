# For Wealth

Track, plan and understand your spending, day by day, week by week, month by month.

## Layout

```
apps/web          React + Vite frontend
apps/api          Hono API (added in slice 1)
packages/shared   Types, Zod schemas, money and date helpers (added in slice 1)
docs/             Spec and decision records
```

## Getting started

```sh
pnpm install
pnpm dev
```

## Docs

- [docs/v1-spec.md](docs/v1-spec.md): what v1 is and how it works
- [GLOSSARY.md](GLOSSARY.md): what each domain term means
- [docs/adr/](docs/adr/): why the hard-to-reverse decisions were made
