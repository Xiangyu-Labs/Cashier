# 2026-03-20 Module Test Gap Plan

## Summary

- Scope: `src/modules/auth`, `currency`, `ledger`, `source-document`, `stats`, `task-queue`, `workspace`
- Audit method: module-local tests plus `tests/unit/**`, `tests/integration/**`, API and hook consumers that directly exercise module behavior
- Result: existing coverage is strongest at action/integration level; the main gaps are direct query/use-case/service/hook/UI-state tests

## Module priorities

1. `ledger`
2. `source-document`
3. `task-queue`
4. `stats`
5. `workspace`
6. `auth`
7. `currency`

## Gap summary

### `ledger`
- Broad action/integration coverage exists.
- Missing direct tests for:
  - high-risk queries
  - service-credential access/services
  - single-ledger concurrency and rollback
  - mutation hooks and credential settings hooks

### `source-document`
- Parse pipeline coverage is strong.
- Missing direct tests for:
  - create-and-queue
  - processing service edge cases
  - source-document query layer
  - detail/cache hooks
  - R2 fallback and delete failure behavior

### `task-queue`
- Action integrations exist.
- Missing direct tests for:
  - queue shaping query
  - cancel/dismiss use-cases
  - true mutation hook logic
  - modal/card interaction and queue UI state

### `stats`
- Integration coverage exists for enhanced stats and soft-delete.
- Missing direct tests for:
  - enhanced stats query branches
  - heatmap color logic
  - adaptive heatmap selection
  - stats chart/header/ranking UI

### `workspace`
- URL params and several hooks are already covered.
- Missing direct tests for:
  - page bootstrap query
  - ledger URL navigation
  - page orchestration
  - dialog/prefetch/details state hooks

### `auth`
- OTP repository, rate limit, core actions, and auth integrations are covered.
- Missing direct tests for:
  - session-user query
  - notification service
  - send-otp failure paths
  - otp verification failure/open behavior

### `currency`
- Core exchange and action tests exist.
- Missing direct tests for:
  - convert-currency use-case
  - exchange-rate helpers
  - display hook and amount UI
  - integration fallback behavior

## Execution order

### Batch A
- `task-queue`
- `stats`
- `workspace`
- `auth`
- `currency`

### Batch B
- `ledger`
- `source-document`

## Verification

- Controller baseline:
  - `npm ci`
  - `npm run test:unit`
  - `npm run test:integration`
- Final verification:
  - `npm run test:unit`
  - `npm run test:integration`
  - `npm run test:coverage`

## Baseline status

- `npm ci`: passed
- `npm run test:integration`: passed
- `npm run test:unit`: failed with 2 pre-existing timeouts
  - `src/modules/source-document/application/tasks/parse-source-document.test.ts`
    - `parseSourceDocumentHandler.onComplete > should save ledger entries and update document status on success`
  - `tests/integration/source-document/quick-entry.test.ts`
    - `createQuickEntryAction > should use provided currency`
- These two failures are baseline red tests and must be treated as pre-existing until a chunk intentionally fixes them.
