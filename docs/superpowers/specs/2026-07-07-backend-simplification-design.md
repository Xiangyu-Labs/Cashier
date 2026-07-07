# Backend Simplification Design

## Goal

Aggressively simplify Cashier's backend internals while preserving externally observable behavior.
The refactor may break internal module APIs, file paths, and test import paths. It must not change user
workflows, API v1 contracts, persisted data semantics, authentication boundaries, task behavior, or AI
parsing outcomes.

## Non-Goals

- No product behavior changes.
- No database table or column semantic changes.
- No UI redesign.
- No replacement of SQLite, Drizzle, NextAuth, Server Actions, or the in-process task model.
- No changes to API v1 routes, request shapes, response shapes, or bearer credential authentication.

## External Behavior To Preserve

- Login, registration policy, OTP, password auth, account management, and session behavior remain the same.
- Ledger, category, service credential, source document, quick entry, batch actions, task queue, stats, and
  currency conversion workflows remain the same.
- API v1 endpoints keep their current URLs, HTTP methods, bearer auth, validation behavior, status codes,
  and JSON response contracts.
- Existing SQLite data remains readable without destructive migration.
- Tenant isolation, ledger access checks, service credential scoping, and soft-delete filtering remain intact.
- Source document parsing still supports current single-pass, second-pass, arbitration, anomaly, invalid,
  cancellation, progress, token tracking, and entry creation behavior.
- Exchange-rate caching and ledger-entry converted amount recalculation remain functionally equivalent.

## Simplification Principles

- Keep abstractions only when there are at least two real production implementations or a strong boundary
  reason such as auth, tenant isolation, external API contracts, or database serialization.
- Prefer direct domain functions over layered re-export chains.
- Prefer one validation boundary per request path.
- Prefer one runtime source of truth for configuration defaults and validation.
- Remove unused generic utilities rather than preserving them for possible future providers.
- Preserve focused tests for observable behavior, but rewrite tests that only defend old internal structure.

## Proposed Architecture

### 1. Remove Dead And Parallel Abstractions

Delete unused or near-unused backend abstractions:

- `src/lib/ai/dual-gpt-runner.ts`, because the active parse pipeline already owns second-pass parsing and
  arbitration.
- The generic `src/lib/serialization` layer, replacing consumers with direct imports from domain contracts.
- Public exposure of test-only storage provider abstractions when they are not used by production code.

The implementation should update tests and imports to depend on the active domain contracts and mappers
instead of compatibility aliases.

### 2. Make Environment Configuration Single-Source

Collapse the current environment stack into one runtime schema module:

- The Zod schema owns defaults, coercion, validation, and cross-field rules.
- Runtime accessors read from the schema result or parse individual values through the same schema fields.
- Public env access also uses the same defaults instead of hand-written fallback strings.
- The catalog either becomes documentation metadata only or is reduced to names/descriptions that do not
  duplicate default values or validation rules.

This preserves startup validation and test-time `process.env` overrides while removing multiple places where
defaults are currently repeated.

### 3. Specialize The Task Engine For Cashier

Replace the generic flow runtime shape with a Cashier-specific task engine:

- The engine directly persists to `task_runs` through Drizzle.
- The engine directly registers the existing task definitions in one bootstrap path.
- The public task capabilities remain: submit, cancel, status, list, running tasks, progress updates, token
  aggregation, cancellation signals, and task lifecycle hooks.
- AI context remains available to tasks, but does not need a generic pluggable runtime/storage interface.
- Existing task types and task record fields remain unchanged.

This keeps the in-process model but removes unused generic storage/runtime adapter layers.

### 4. Flatten Domain Entry Points

For backend modules, reduce the number of equivalent entry points:

- Server Action files remain the auth and input-validation boundary.
- Domain query/use-case files own business logic and database access.
- Pure re-export barrels that only rename paths are deleted or reduced.
- Query variants such as `query`, `listX`, and `fromValidatedInput` are collapsed unless each variant has a
  distinct production caller and responsibility.
- Tests may import the concrete domain function they exercise, even if the path changes.

The first target areas are source-document queries, ledger queries/use-cases, task-queue actions, and module
top-level barrels.

### 5. Remove Import-Time Orchestration Side Effects

Exchange-rate recalculation orchestration should initialize in a single explicit bootstrap path, not as a
top-level side effect of importing unrelated use cases.

Business functions should call currency conversion or recalculation directly when that is their explicit job.
The event handler for "rates stored" should be registered once during server startup or task/bootstrap
initialization.

### 6. Preserve Worthwhile Boundaries

These should remain, even in the aggressive cleanup:

- `withAuth`, `requireAuth`, `requireLedgerAccess`, and `withLedgerAccess`, because they encode security and
  tenant isolation.
- DTO mappers at database-to-client boundaries, because Drizzle rows contain `Date` values and internal fields
  that should not leak accidentally.
- API v1 shared route handling, because it centralizes bearer credential auth, rate limiting, and HTTP error
  formatting.
- The active parse pipeline modules, because they represent real business stages rather than speculative
  framework layers.

## Testing Strategy

### Governance Tests

Add or update tests that assert:

- Removed modules are not imported from production source.
- Environment defaults are defined in one runtime schema path.
- Task registration is explicit and does not rely on scattered import side effects.
- API v1 routes still use the shared route helper.

### Behavioral Tests

Keep or adjust existing unit and integration coverage for:

- Auth and ledger access.
- Source document creation, retry, update, delete, query, and parsing tasks.
- Task queue cancel/dismiss/query behavior.
- Currency conversion and exchange-rate-triggered recalculation.
- API v1 query and mutation endpoints.

### Verification Commands

Each implementation phase should run the focused tests it touches. Final verification should include:

```bash
npm run lint
npm run tsc
npm run test:unit
npm run test:integration
```

`npm run build` may be run after the TypeScript and integration test pass, especially if route/action import
paths changed.

## Migration Plan

Implementation should be split into small phases:

1. Delete unused AI and serialization abstractions and update imports.
2. Collapse environment configuration and update env tests.
3. Simplify task engine/runtime while preserving task behavior.
4. Flatten source-document and ledger entry points.
5. Move exchange-rate orchestration initialization to explicit bootstrap.
6. Run full verification and remove obsolete tests that only asserted old internal structure.

Each phase should have its own focused tests and commit.

## Risks

- Broad import-path churn may create temporary TypeScript failures across tests and application code.
- Simplifying the task engine can accidentally change cancellation or token usage behavior if not covered by
  focused tests.
- Env consolidation can break tests that rely on late `process.env` mutation if runtime values become cached.
- Removing compatibility barrels can reveal circular imports that were previously hidden.

## Acceptance Criteria

- External user workflows and API v1 contracts are unchanged.
- Internal backend files and exported entry points are materially fewer or simpler.
- No production imports reference deleted compatibility modules.
- Startup env validation still catches missing or invalid required values.
- Task submission, progress, cancellation, failure, completion, and token usage behavior remain covered by
  tests.
- Full lint, typecheck, unit, and integration verification pass after implementation.
