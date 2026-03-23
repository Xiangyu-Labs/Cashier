# Architecture Overview

Cashier uses a **module-based vertical slice architecture**. The organizing unit is `src/modules/*`, not the legacy `src/features/*` tree. Each module owns its domain contracts, application logic, public entrypoints, and module-specific UI.

## High-Level Directory Structure

```text
src/
├── app/            # Next.js App Router boundary layer
├── modules/        # Domain modules (auth, ledger, source-document, workspace, ...)
├── lib/            # Shared infrastructure and cross-cutting utilities
├── components/     # Shared UI primitives and reusable app-wide components
├── persistence/    # Drizzle schema and relations source of truth
└── types/          # App-wide shared type helpers
```

## 1. Modules (`src/modules/*`)

Each directory in `src/modules/` represents one domain capability or orchestration shell.

Typical shape:

```text
src/modules/ledger/
├── actions.ts          # Public server-action entrypoint
├── contracts.ts        # Public DTOs and module contracts
├── hooks/              # Module-owned client hooks
├── application/        # Use cases, queries, task handlers, pure business logic
├── server-actions/     # Auth/input boundary wrappers for server execution
└── ui/                 # Module-owned UI entrypoint and components
```

### Rules for Modules

1. **Cross-module imports go through declared public entrypoints only**: use only the module subpaths that the repository lint configuration explicitly marks as public for that module. A single-segment path is not public just because it exists under `src/modules/<name>/`.
2. **Do not deep-import another module's internals**: `application/*`, `server-actions/*`, `ui/SpecificFile`, `hooks/SpecificHook`, and other nested paths are private even when the top-level `ui` or `hooks` barrel is public.
3. **Application must not depend on actions/server-actions**: shared business logic belongs in `application/*`, and server-actions call into it.
4. **Workspace is an orchestration shell, not a dumping ground**: URL state, tab coordination, and page bootstrap live there, but ledger/source-document/stats business logic stays in the owning module.
   $1
5. **`use-cases.ts` is a pure re-export barrel**: the optional `use-cases.ts` at the module root exists solely to re-export symbols from `application/*` under a single import path. It must not define types, implement logic, or wrap function signatures. Any adapter, mapping, or business logic belongs inside `application/use-cases/` or `application/services/`. If a module needs no such aggregation it may omit `use-cases.ts` entirely.

## 2. Shared Kernel (`src/lib/*`)

`src/lib/` is reserved for infrastructure and cross-cutting helpers that are not owned by a single module.

- `lib/db`: runtime database access and scoped query helpers
- `lib/flow`: background task orchestration
- `lib/errors`: shared error taxonomy
- `lib/storage`: file/image storage abstractions
- `lib/utils`: generic utilities only

Avoid placing module business rules in `src/lib`. If logic needs module contracts, module settings, or module-specific auth rules, keep it inside the owning module.

## 3. App Boundary (`src/app`)

`src/app` stays thin. Pages and route handlers should handle:

- auth and request boundary concerns
- parsing and validation
- calling module public APIs
- returning UI or HTTP responses

Pages should not reach into `persistence` or module internals. If a route needs orchestration, expose that orchestration from the owning module and call it from `src/app`.

## 4. Data Access

We use **Drizzle ORM** with a split between runtime DB helpers and schema ownership:

- **Schema source of truth**: `src/persistence/schema/*.ts`
- **Relations**: `src/persistence/relations.ts`
- **Runtime DB access**: `src/lib/db/index.ts`
- **Scoped query helpers**: `src/lib/db/scoped-query.ts`

Module code may import schema entities from `@/persistence`, but `src/app` and shared UI code must not depend on persistence directly.

## 5. Background Tasks

- Task modules export explicit task definitions `{ type, handler }`.
- Only `lib/flow/task-registry.ts` is allowed to register tasks with the engine.
- Task metadata such as `deduplicationKey` must be first-class engine fields, not hidden inside task input payloads.
- Source-document task queue behavior must use `entityType` + `entityId` as the source of truth. `task.input` remains an audit payload only.
- Source-document creation is funneled through one shared application use case before `parse_source_document` is submitted.

## 6. Key Technologies

- **Framework**: Next.js 16 (App Router)
- **Database**: SQLite
- **ORM**: Drizzle ORM
- **Authentication**: Auth.js (NextAuth) v5
- **UI System**: Tailwind CSS + Shadcn/ui (Radix Primitives)
- **Async Processing**: In-Process Task Runner (Simple, memory-based)
