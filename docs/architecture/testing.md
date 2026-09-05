# Testing Architecture

Cashier keeps fast, deterministic unit tests separate from database-backed integration tests.

## Commands and prerequisites

- `npm test` runs the unit projects once and requires only Node.js 24.
- `npm run test:watch` watches the unit projects.
- `npm run test:integration` starts an isolated PostgreSQL container and runs both integration
  projects.
- `npm run test:all` and `npm run test:run` run every project once.
- `npm run test:coverage` runs every project with the repository coverage thresholds.

Database-backed commands require a running Docker daemon but no `.env`, credentials, fixed port, or
manual migration step. Testcontainers uses `postgres:17-alpine` with a random host port and releases
the container after the Vitest run. The first run may download PostgreSQL and resource-reaper images.
`npm run test:prepare` checks this lifecycle once and immediately releases the resource.

## Test layers

- Unit tests do not access PostgreSQL, the network, or real time. Pure `.test.ts` logic runs in
  Node; component tests and tests that actually use browser APIs run in happy-dom. External
  boundaries are mocked or replaced with in-memory fakes.
- Integration tests verify PostgreSQL behavior, route and server-action composition, transactions,
  concurrency, and persistence-backed adapters.
- The same behavior is fully verified at the lowest suitable layer. Higher layers focus on
  authorization, validation, error mapping, and composition.

Production-file helpers exposed only for focused tests use `@testOnly`; compatibility or framework
entrypoints that static analysis cannot discover use `@publicContract`. The complete Knip pass still
checks both categories. Only the production-only pass excludes the reviewed labels, so removing the
last test or caller makes the complete pass fail instead of silently accumulating exports.

## Isolation

Database-backed Vitest global setup provides a unique run ID and connection URL to its workers. Each
isolated Vitest worker uses a schema
named `test_<run-id>_w<worker-id>`; the pool slot and isolated worker identity both participate in
the actual identifier. Separate runs never share schemas. The runner removes only schemas belonging
to its own run after normal completion, failure, or interruption.

`TEST_DATABASE_URL` is an explicit advanced override and never falls back to `DATABASE_URL`. It must
be a PostgreSQL URL whose database name ends in `_test`; the target must already have `pg_trgm` in
`public` and allow schema creation. Connection or validation failures stop the run instead of
starting a local container. Cleanup first enumerates matching run schemas and never removes the
database, `public`, or another run's schemas.

Every test worker installs an MSW network guard. Shared deterministic handlers cover the background
OpenAI failure path and Frankfurter exchange-rate fixture; tests may add case-specific handlers or
use existing mocks. Any other unhandled HTTP request fails the test even when application code
catches the request error. Diagnostics contain only `TEST_UNEXPECTED_HTTP`, the method, and the
origin; paths, query parameters, credentials, and bodies are excluded.

Integration files are serialized within a worker because their setup truncates the worker schema
between tests. Do not use `test.concurrent` or `describe.concurrent` in database-backed tests
without introducing test-case-level isolation.

## Duplicate and compatibility coverage

Verify a behavior completely once at the lowest suitable layer. Keep upper-layer tests for the
boundary-specific behavior they add.

Compatibility or legacy tests must state the input format, migration, or compatibility contract
they protect. When the corresponding compatibility code is removed, remove the test at the same
time.

Contract suites may intentionally run against both a fake harness and the real PostgreSQL/storage
adapter. This repetition protects the shared contract rather than duplicating an implementation
test.
