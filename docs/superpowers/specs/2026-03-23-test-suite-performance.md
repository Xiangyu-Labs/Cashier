# Test Suite Performance Optimization Spec

**Problem Statement:** The current Vitest suite is correct but slower than it needs to be. We need to reduce wall-clock runtime without weakening assertions, coverage, fixture fidelity, database isolation, or CI confidence.

## Requirements

- Keep all existing behavioral assertions unless a stronger equivalent replaces them.
- Do not delete, skip, or quarantine tests as a speed optimization.
- Preserve the current unit/integration split semantically:
  - `test:unit` must execute only unit/governance tests.
  - `test:integration` must execute only integration tests.
- Preserve database isolation for tests that mutate persistence state.
- Preserve DOM coverage for tests that actually need browser APIs.
- Keep `npm run check` green on CI after the refactor.

## Measured Baseline On 2026-03-23

- `npm run test:unit -- --reporter=json --outputFile=.tmp/test-reports/unit.json`
  - Wall clock: `53.734s`
  - Reported tests: `1509`
  - Files in report: `258`
  - Unexpected overlap: `69` integration files / `420` integration assertions were executed inside the unit run
- `npm run test:integration -- --reporter=json --outputFile=.tmp/test-reports/integration.json`
  - Wall clock: `14.713s`
  - Reported tests: `420`
  - Files in report: `69`
- `tests/unit/eslint/feature-boundaries.test.ts`
  - File duration inside the unit report: about `24.4s`
  - The file currently creates a new `ESLint` instance for each of `76` cases
- Unit test routing observations:
  - `189` files live under `tests/unit`
  - `175` of those files do not appear to need the database helper from `tests/setup.ts`
- Environment observations:
  - `68 / 69` integration files look Node-only
  - Only `1` integration file currently looks DOM-dependent: `tests/integration/client/category-mutations-optimistic.test.tsx`

## Non-Goals

- Rewriting business logic to make tests faster.
- Replacing realistic integration coverage with mocks.
- Migrating away from Vitest.
- Redesigning the entire test folder structure unless needed for routing correctness.

## Acceptance Criteria

- `npm run test:unit` no longer executes files from `tests/integration`.
- `npm run test:unit` keeps the current unit assertion count baseline of `1089` unless new tests are intentionally added during implementation.
- `npm run test:integration` keeps the current integration assertion count baseline of `420` unless new tests are intentionally added during implementation.
- The optimized suite is materially faster on the same machine, with an initial target of bringing the test portion of `npm run check` below `45s` wall time and a stretch target below `35s`.
- Slow-file profiling after the refactor shows `tests/unit/eslint/feature-boundaries.test.ts` is no longer the dominant bottleneck.
