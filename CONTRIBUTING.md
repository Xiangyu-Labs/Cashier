# Contributing to Cashier

Cashier began as a personal project and is still in an early public stage. Focused bug reports,
reproducible fixes, documentation improvements, and small feature proposals are welcome.

## Development setup

Use Node.js 24.

```bash
npm ci
cp .env.local.example .env
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d \
  postgres minio storage-bootstrap
npm run db:migrate
npm run dev
```

Fill the initial user and AI values in `.env` before starting the application. Never commit `.env`,
provider credentials, real receipts, API keys, or raw personal data.

## Project layout

- Locale-prefixed routes and API handlers live in `src/app/`.
- Business logic and feature UI live in domain modules under `src/modules/`.
- Shared application contracts and infrastructure live in `src/application/`, `src/lib/`,
  `src/components/`, and `src/persistence/`.
- PostgreSQL migrations live in `src/persistence/postgres-migrations/`.
- Translations live in `messages/`.
- Unit and integration tests live in `tests/unit/` and `tests/integration/`.

Read [Architecture and Coding Patterns](./docs/architecture/coding-patterns.md) before changing
module boundaries, data access, server actions, or runtime composition. Test placement and isolation
rules are in [Testing Architecture](./docs/architecture/testing.md).

## Code style

- Use strict TypeScript and the `@/*` alias.
- Prettier uses two-space indentation, semicolons, double quotes, ES5 trailing commas, and a
  100-column width.
- Prefer kebab-case utility and route filenames, PascalCase React components, and `useX` hook names.
- Validate external input with Zod.
- Authenticate server mutations and authorize the target ledger.
- Scope tenant data by `ledgerId` and preserve inward dependency direction.

## Tests and checks

Run the narrowest relevant check while working:

```bash
npm run test:unit
npm run test:integration
npx vitest run tests/unit/path/to/file.test.ts
```

Before opening a pull request, run:

```bash
npm run check
```

This runs formatting, architecture checks, lint, type checking, tests, coverage, production build,
and translation validation. Coverage thresholds are 70% for lines, 68% for statements, 65% for
functions, and 60% for branches.

## Browser smoke tests

With Node.js 24 and Docker available:

```bash
npx playwright install chromium
npm run test:smoke
```

The runner creates a uniquely named database on the loopback `cashier_test` PostgreSQL service,
applies real migrations, seeds a fictional password account, builds production assets, and runs
desktop and mobile Chromium tests. It does not use an authentication bypass, real email, AI, or
object storage. `TEST_DATABASE_URL` may override the test connection, but must still point to a
loopback database named `cashier_test` with `CREATEDB` permission. Never point it at production.

The suite covers password rejection/login, automatic initial ledger creation, manual entry,
editing, persistence after reload, deletion, logout, and protected-page redirects. Failures retain
screenshots and traces in `test-results/` and an HTML report in `playwright-report/`. Normal exit,
failure, and handled interruptions stop the test server and remove only this run's database.
CI runs this separately from the Vitest gate and requires it before publishing an image.

## Commits and pull requests

Use Conventional Commit subjects such as:

```text
feat: add ...
fix: prevent ...
docs: explain ...
chore: update ...
```

Pull requests should:

- Explain the user-visible behavior change and its reason.
- Link the issue or discussion when one exists.
- List the commands used for validation.
- Call out migrations, configuration changes, or compatibility implications.
- Include screenshots or recordings for UI changes, using fictional or fully sanitized data.

For substantial behavior changes, open an issue or discussion before investing in a large
implementation. Do not mix unrelated cleanup into the same pull request.
