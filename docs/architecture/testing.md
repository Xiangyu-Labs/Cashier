# Testing Architecture

Cashier keeps fast, deterministic unit tests separate from database-backed integration tests.

## Test layers

- Unit tests do not access PostgreSQL, the network, or real time. External boundaries are mocked or
  replaced with in-memory fakes.
- Integration tests verify PostgreSQL behavior, route and server-action composition, transactions,
  concurrency, and persistence-backed adapters.
- The same behavior is fully verified at the lowest suitable layer. Higher layers focus on
  authorization, validation, error mapping, and composition.

## Isolation

Browser smoke tests live in `tests/smoke/` and run with Playwright against a production build.
They exercise actual browser, authentication, server-action, and PostgreSQL boundaries. Each run
owns a separate `smoke_<uuid>` database; desktop/mobile scenarios run serially with fresh browser
contexts. The application creates the account's default ledger through its normal login flow.
No existing user database is migrated, seeded, or truncated. See `CONTRIBUTING.md` for the command.

Database-backed Vitest runs set `CASHIER_TEST_RUN_ID`. Each isolated Vitest worker uses a schema
named `test_<run-id>_w<worker-id>`; the pool slot and isolated worker identity both participate in
the actual identifier. Separate runs never share schemas. The runner removes only schemas belonging
to its own run after normal completion, failure, or interruption.

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
