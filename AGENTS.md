# Repository Guidelines

## Project Structure & Module Organization

Cashier is a Next.js 16 App Router application. Keep locale-prefixed routes and API handlers in
`src/app/`; delegate business logic to `src/modules/`. Domain modules
(`auth`, `currency`, `ledger`, `source-document`, `stats`, and `workspace`) own contracts,
application use cases, server actions, hooks, and feature UI. Shared infrastructure belongs in
`src/application/`, `src/lib/`, `src/components/`, and `src/persistence/` (Drizzle schema and
PostgreSQL migrations). Translations live in `messages/`, assets in `public/`, and tests in
`tests/unit/`, `tests/integration/`, and `tests/fixtures/`.

## Build, Test, and Development Commands

Use Node.js 24.

- `npm ci` installs the lockfile-pinned dependencies.
- `npm run docker:local` starts the local app, PostgreSQL, and MinIO stack; `npm run dev` runs
  Next.js after dependencies are available.
- `npm run test:unit` and `npm run test:integration` run Vitest projects.
- `npm run test:run` runs the complete suite once; `npm run check` runs the full formatting,
  architecture, lint, type, test, coverage, build, and i18n gate.
- `npm run build` validates the production build. Use `npm run db:migrate` for tracked migrations
  and `npm run validate:i18n` after translation changes.

## Coding Style & Naming Conventions

Use Prettier’s two-space indentation, semicolons, double quotes, ES5 trailing commas, and
100-column width (`npm run format`). Use strict TypeScript and the `@/*` alias. Prefer kebab-case
utility/route filenames, PascalCase React components, and `useX` hook names; tests end in
`.test.ts` or `.test.tsx`. Validate inputs with Zod, authorize ledger access, and preserve inward
dependency direction.
Read `docs/architecture/coding-patterns.md` before changing architecture.

## Testing Guidelines

Vitest runs unit tests in `tests/unit/` and integration workflows in `tests/integration/`;
Testing Library covers UI. Database-backed tests require the PostgreSQL test service and
are prepared automatically by the npm test scripts. Add regression coverage beside the affected
area and run a focused file with `npx vitest run tests/unit/path/to/file.test.ts`. Coverage
thresholds are 70% for lines, 68% for statements, 65% for functions, and 60% for branches.

## Commit & Pull Request Guidelines

Follow the existing Conventional Commit style, such as `feat: ...`, `fix: ...`, or `chore: ...`,
with an imperative subject. Pull requests should explain the behavior change, link the
issue or context, list validation commands, and call out migrations or environment changes.
Include screenshots or recordings for UI changes and keep CI checks passing.

## Security & Configuration

Use `.env.local.example` for the built-in PostgreSQL/MinIO stack and `.env.example` for external
service deployments, but never commit `.env` or provider credentials.
Keep tenant queries scoped by `ledgerId`, avoid logging tokens or raw personal data, and treat
storage/database cleanup commands as destructive until their dry-run output is reviewed.
