# Independent Backend Simplification Design

## Goal

Simplify Cashier's backend internals so the code matches the product's current scale: a personal and light
automation-oriented AI bookkeeping app, not an enterprise finance platform. The work must reduce navigation
cost, duplicate entry points, and single-implementation framework shells while preserving user-visible behavior,
API contracts, persisted data semantics, tenant isolation, and AI parsing outcomes.

This specification is based on a fresh read of the current codebase. It does not rely on any earlier backend
simplification plan as an input.

## Current Context

Cashier is a Next.js App Router application using Server Actions, Drizzle ORM, SQLite, NextAuth, Zod, Vitest,
TanStack Query, and an in-process task runner. The backend is not a separate service; it lives primarily in
`src/app/api`, `src/modules`, `src/lib`, and `src/persistence`.

The long-lived product scope in `docs/architecture/PRD.md` is intentionally lightweight: personal use, AI
receipt parsing, quick entry, ledgers, source documents, service credentials, multi-currency conversion, and
statistics. The codebase is substantially larger than that product shape:

- `src/modules`: 340 TypeScript files and about 27,455 lines.
- `src/modules/ledger`: 103 files and about 7,649 lines.
- `src/modules/source-document`: 101 files and about 9,682 lines.
- `src/lib/flow`: 9 files and about 1,422 lines.
- `src/lib/env`: 6 files and about 592 lines.
- `tests`: 235 TypeScript files and about 32,415 lines.

That size is not automatically wrong. Source document parsing, task cancellation, API v1 access, and ledger
isolation are real product complexity. The simplification target is the complexity that exists mostly to support
internal structure rather than product behavior.

## Findings

### 1. The task runtime is more framework-shaped than the app needs

`src/lib/flow` currently exposes a generic `FlowEngine`, `FlowEngineConfig`, `FlowContext`,
`FlowTaskHandler`, `FlowTaskDefinition`, `AIContextFactory`, registry, runtime singleton, metrics helpers, and
AI context wrapper. The engine itself directly persists to `task_runs`, manages concurrency, cancellation,
deduplication, progress, token aggregation, lifecycle hooks, and DB mapping in one 587-line file.

The underlying capabilities are necessary:

- submit background AI work and return a task id immediately;
- persist pending/running/completed/failed/cancelled state;
- cancel queued and running tasks;
- update progress;
- collect token usage;
- keep task queue and processing APIs working after server restarts as much as the current in-process model
  supports.

The over-design is the generic framework surface around those capabilities. Current production tasks are known
Cashier tasks, not plugins loaded from third-party packages. The code should read as a Cashier task runtime, not
as a reusable task framework.

### 2. Environment configuration is split across too many sources

Environment behavior is currently spread across:

- `src/lib/env/catalog.ts` for key metadata;
- `src/lib/env/defaults.ts` for default values;
- `src/lib/env/startup.ts` for Zod schemas and startup validation;
- `src/lib/env/runtime.ts` for typed getters;
- `src/lib/env/public.ts` for public app URL access;
- `src/lib/env/log-level.ts` for one specific value.

This creates a maintenance pattern where adding or changing one setting requires touching multiple files and
tests. The schema already has enough information to own defaulting, coercion, and validation. The catalog can
remain documentation metadata, but it should not act like a parallel runtime model.

### 3. Module boundary rules and actual imports disagree

`docs/architecture/coding-patterns.md` says cross-module calls should go through top-level module public
entrypoints. Current production source imports `@/modules/*/application/*` directly many times. A quick scan
found about 72 production `application` imports. Examples include:

- `src/modules/workspace/application/queries/get-ledger-page-bootstrap.ts`, which directly imports ledger,
  stats, and source-document queries.
- API v1 routes, which directly import application query functions.
- server-action files, which directly import application use cases and queries.

This disagreement has two bad outcomes:

- If the rule is enforced strictly, the codebase grows more pass-through barrels.
- If the rule is ignored, the architecture document becomes misleading.

The sustainable rule should be narrower: UI and external callers use stable module entrypoints; server boundary
files and same-server composition code may import concrete application functions when the dependency is explicit
and tested.

### 4. There are too many equivalent entry points for common backend paths

Some paths have multiple names for the same operation:

- source-document list query: `listSourceDocumentsQuery`, `listSourceDocuments`, server-action
  `listSourceDocuments`, `getSourceDocumentsAction`, and an internal `source-document-queries.ts` barrel.
- ledger entry mutations: server action functions build payloads, call application use cases, and tests import
  both action and use-case variants.
- top-level `actions.ts`, `queries.ts`, `use-cases.ts`, `tasks.ts`, `mappers.ts`, and `contracts.ts` barrels
  are useful for UI-facing imports, but they are not all useful inside backend implementation code.

The result is higher navigation cost. A maintainer changing a query or action has to determine whether a wrapper
is a real boundary or just an alias.

### 5. Some complexity is necessary and should remain

The following are not simplification targets:

- `requireLedgerAccess` and `withLedgerAccess`, because they encode auth, ledger ownership, UUID handling, and
  soft-delete checks.
- API v1 shared route helper, because it centralizes bearer credential authentication, rate limiting, error
  logging, and HTTP response formatting.
- DTO mappers, because Drizzle rows contain `Date` objects and internal fields that should not leak across
  server/client/API boundaries.
- source document parse pipeline modules, because parsing, arbitration, reconciliation, defensive AI handling,
  cancellation, and result mapping are real business stages.
- Drizzle schema, migrations, and persistence relations.
- Service credential auth boundary and rate limits.

## Design Principles

1. Keep boundaries that protect security, tenant isolation, persisted data semantics, or public contracts.
2. Remove or flatten abstractions that have only one production implementation and no strong boundary reason.
3. Prefer direct, named backend functions over chains of equivalent aliases.
4. Keep validation at request boundaries and domain entry points; avoid parsing the same input shape in three
   wrappers.
5. Make architecture documentation describe the intended current code, not an idealized shape that causes
   more wrappers.
6. Preserve test coverage for behavior and public contracts; remove tests that only defend obsolete internal
   paths.

## Recommended Approach

Use a strong internal simplification path. Be aggressive about removing backend compatibility layers, optional
barrels, generic naming, and split configuration sources. Stay conservative only at boundaries that protect
security, tenant isolation, API v1 contracts, persisted data, DTO serialization, or source-document parsing
behavior.

This is intentionally more aggressive than a light cleanup. Broad import churn is acceptable when it deletes
internal indirection. Behavioral churn is not acceptable.

### Alternative A: Conservative cleanup only

Delete a few unused barrels and tighten governance tests.

Pros:

- Low risk.
- Small PRs.
- Easy to verify.

Cons:

- Leaves the task runtime and env split mostly intact.
- Does not resolve the architecture-document mismatch.
- Navigation cost stays high.

### Alternative B: Aggressive backend rewrite

Replace the flow runtime, env layer, module entrypoints, and query organization in one large pass.

Pros:

- Maximum simplification.
- Cleanest final shape if executed perfectly.

Cons:

- High regression risk around task cancellation, AI parsing, service credentials, and API v1.
- Hard to review.
- Likely to create broad test churn unrelated to user-visible behavior.

### Alternative C: Staged backend simplification

Refactor in phases:

1. Update governance and architecture rules to reflect the target shape.
2. Collapse env defaults/schema/runtime into a single source of truth.
3. Rename and narrow the task runtime surface around Cashier tasks.
4. Flatten source-document and ledger entry/query aliases where they are pure pass-throughs.
5. Keep API v1, auth, mapper, parse pipeline, and DB boundaries intact.

Pros:

- Reduces real complexity while keeping each phase testable.
- Aligns code and documentation.
- Avoids turning simplification into a rewrite.

Cons:

- Takes multiple commits.
- Requires careful import migration and focused tests.

### Alternative D: Strong internal simplification

Refactor in phases, but with a stricter target:

1. Rename the task runtime concept and directory away from `flow`.
2. Delete optional backend barrels instead of merely discouraging their use.
3. Make env schema/defaults the single runtime source and delete the parallel catalog module.
4. Collapse source-document query naming so there is one public domain function and one normalized query helper.
5. Add governance tests that prevent deleted internal compatibility paths from returning.
6. Keep API v1, auth, mapper, parse pipeline, and database boundaries intact.

Pros:

- Produces a clearer final codebase, not just cleaner imports.
- Removes the recurring temptation to add pass-through barrels for policy compliance.
- Makes future backend work easier to navigate.

Cons:

- Larger import migration.
- More tests need import updates.
- Requires disciplined phase boundaries to avoid behavior changes.

Recommended: Alternative D.

## Target Architecture

### Backend Boundary Rules

Revise the durable module-boundary rule:

- UI, React hooks, route components, and cross-client code import Server Actions from `src/modules/{domain}/actions.ts`
  and DTO types from `contracts.ts`.
- API v1 routes use `src/app/api/v1/_shared/route-helper.ts` and may import concrete application query/use-case
  functions when they need service-credential authorization rather than session authorization.
- Server Actions remain the session-auth and input-validation boundary. They may import concrete
  `application/queries/*` and `application/use-cases/*` functions directly.
- Backend composition modules such as workspace bootstrap may import concrete application functions directly
  when doing so is clearer than creating a new barrel.
- Top-level `queries.ts` and `use-cases.ts` barrels are not default architecture. Delete optional backend barrels
  unless they have a documented public caller category that cannot use concrete application paths.
- UI-facing `actions.ts` and DTO-facing `contracts.ts` remain stable module entrypoints. `tasks.ts` may remain
  when it hides task definition file layout from centralized task registration.

### Environment Configuration

Create one runtime schema module that owns:

- default values;
- Zod schema definitions;
- coercion;
- current validation rules for required, optional, URL, number, boolean, email-sender, and public URL values;
- `validateStartupEnv`;
- `getRuntimeEnvValue`;
- inferred types for runtime getters.

Delete the separate `defaults.ts`. Keep `runtime.ts` as a small named-property adapter backed by the schema so
call sites stay readable and tests can still mutate `process.env` without module reload gymnastics. Keep
`public.ts` as a browser-inlining-safe accessor for `NEXT_PUBLIC_*`.

Delete `catalog.ts` and its lookup helper because current production source does not call it. Replace catalog
tests with schema/default tests that prove the runtime schema owns all app env keys. Environment documentation
should live in `.env.example` and code comments near the schema, not in a parallel runtime catalog.

### Task Runtime

Rename the conceptual surface and directory from a generic flow engine to a Cashier task runtime.

Keep:

- task submission;
- cancellation;
- task listing/status;
- pending/running deduplication;
- progress updates;
- token aggregation;
- lifecycle hooks;
- centralized task registration;
- AI context for existing tasks.

Reduce:

- generic `FlowEngine` naming in production-facing APIs;
- the `src/lib/flow` directory name;
- broad exported type surface from the task runtime index;
- registry idempotency layers that exist only to support multiple hypothetical engines;
- comments that describe a reusable framework rather than Cashier's concrete task runtime.

Target names:

- directory: `src/lib/tasks`;
- factory: `createTaskRuntime`;
- singleton initializer: `initializeDefaultTaskRuntime`;
- accessors: `getTaskRuntime`, `submitTask`, `cancelTask`, `resetTaskRuntime`;
- types: `TaskRuntime`, `TaskRuntimeConfig`, `TaskContext`, `TaskHandler`, `TaskDefinition`, `TaskMetadata`.

Compatibility aliases may exist only inside the migration phase where imports are being moved. They must be
removed before final verification.

### Query And Action Entry Points

For source documents:

- Keep one request-boundary function for Server Actions.
- Keep one public domain function that parses contract input and calls one normalized query helper.
- Rename normalized helpers so their role is obvious, for example `querySourceDocumentPage` for already-normalized
  params and `listSourceDocuments` for contract-input callers.
- Remove duplicate names where a Server Action, domain function, and query helper are all called
  `listSourceDocuments`.
- Remove internal re-export-only barrels that add no boundary.
- Make API v1 source-document GET use the same domain function as the Server Action unless service credential
  behavior requires a distinct input path.

For ledger:

- Keep `actions.ts` as the UI-facing Server Action surface.
- Keep concrete application files for business logic.
- Delete and prevent recreation of `ledger/queries.ts` or `ledger/use-cases.ts` barrels for internal server callers.
- Remove backend imports through optional barrels such as `auth/use-cases.ts`, `auth/queries.ts`,
  `currency/use-cases.ts`, `stats/queries.ts`, `workspace/use-cases.ts`, and `workspace/queries.ts` where the
  caller can import a concrete application file.
- Split very broad mutation files only when it clarifies responsibilities without creating another alias layer.

For workspace bootstrap:

- Allow direct concrete application imports.
- Keep it as a server composition module because it prefetches multiple domains into a React Query cache.

### Tests And Governance

Add governance tests for the new target shape:

- env defaults are not defined outside the runtime schema module;
- task runtime exports do not expose obsolete `Flow*` compatibility APIs after migration;
- production source does not import from `src/lib/flow` after the task runtime directory migration;
- deleted internal barrels stay deleted;
- optional backend `queries.ts` and `use-cases.ts` barrels stay deleted or unused unless explicitly allowlisted;
- API v1 routes continue to use the shared route helper;
- UI-facing code imports actions from module `actions.ts`, not deep server-action paths.

Keep behavioral tests for:

- auth and ledger access;
- source document create/list/retry/update/delete;
- quick entry;
- API v1 routes and service credential auth;
- task submit/progress/cancel/dismiss/list;
- AI parse pipeline;
- currency conversion and exchange-rate-triggered recalculation;
- multi-user isolation and soft-delete filtering.

## Non-Goals

- No UI redesign.
- No replacement of Next.js, Drizzle, SQLite, NextAuth, OpenAI SDK, or TanStack Query.
- No database schema semantic changes.
- No API v1 URL, method, request, response, status-code, or auth contract changes.
- No changes to source document parsing prompts or AI output semantics.
- No feature removal.
- No broad test rewrite solely to make imports prettier.
- No merge of Server Actions into application use cases; the request boundary remains distinct.
- No removal of DTO mappers, ledger access wrappers, service credential auth, rate limiting, or API v1 helper.

## Risks

- Renaming `flow` APIs can break tests and task call sites unless done with a compatibility phase.
- Moving `src/lib/flow` to a task runtime directory creates broad import churn and may require temporary aliases.
- Env consolidation can break tests that mutate `process.env` at runtime if getters become cached too early.
- Query flattening can accidentally move validation from Server Actions or API routes into the wrong layer.
- Module-boundary doc changes can weaken architecture if phrased too loosely.
- Removing wrappers can expose circular imports that were previously hidden by barrels.
- Deleting optional backend barrels can break tests that assert old internal paths instead of behavior.

## Acceptance Criteria

- `npm run lint` passes.
- `npm run tsc` passes.
- Focused unit and integration tests for env, task runtime, source documents, ledger actions, API v1, and
  workspace bootstrap pass.
- API v1 route contract tests still pass.
- Multi-user isolation tests still pass.
- No deleted compatibility barrel is imported from production source.
- Production source no longer imports from `src/lib/flow`; task runtime imports use the new task runtime path.
- Optional backend `queries.ts` and `use-cases.ts` barrels are deleted or unused according to governance tests.
- Architecture docs match the resulting backend import policy.
- User workflows remain unchanged for login, ledger views, source documents, quick entry, task queue, stats,
  currency conversion, and API automation.

## Suggested Implementation Phases

1. Governance and architecture-doc update.
2. Env consolidation and catalog deletion.
3. Task runtime directory migration from `src/lib/flow` to a task runtime path.
4. Removal of `Flow*` compatibility aliases after production and tests migrate.
5. Source-document query entrypoint flattening and normalized helper renaming.
6. Backend optional barrel deletion and direct application imports.
7. Final verification and stale-test cleanup.
