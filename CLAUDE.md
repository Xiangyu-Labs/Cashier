# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Cashier is an AI-powered bookkeeping application that uses LLMs to parse receipts and invoices, automatically categorizing and recording expenses. Built with Next.js 16 (App Router), TypeScript, SQLite/Drizzle ORM, and OpenAI.

## Commands

```bash
# Development
npm run dev              # Start dev server
npm run build            # Production build
npm run start            # Start production server
npm run lint             # ESLint

# Testing (uses in-memory SQLite, no external DB needed)
npm run test             # Watch mode
npm run test:run         # Single run
npm run test:coverage    # With coverage
# Run a single test file:
npx vitest run tests/unit/lib/date-utils.test.ts
# Run tests matching a pattern:
npx vitest run -t "should parse receipt"

# Database (Drizzle ORM)
npm run db:push          # Push schema changes
npm run db:generate      # Generate migrations
npm run db:migrate       # Run migrations
npm run db:studio        # Launch Drizzle Studio GUI
npm run db:drop          # Drop database

# Docker
npm run docker:build     # Build Docker image
npm run docker:prod      # Start production Compose service
npm run docker:down      # Stop production Compose service

```

## Architecture

### Directory Structure

- `src/app/[locale]/` - Next.js App Router with i18n (next-intl). All routes are locale-prefixed.
- `src/app/[locale]/(protected)/` - Auth-protected routes (ledger, admin, settings)
- `src/modules/` - Domain modules: `auth`, `currency`, `ledger`, `source-document`, `stats`, `workspace`. Each module owns its contracts, application logic, public entrypoints, and module-specific UI/hooks
- `src/persistence/` - Drizzle schema, relations, and migrations source of truth
- `src/lib/` - Core infrastructure: `db/` (runtime DB access and scoped query helpers), `tasks/` (task runtime), `store/` (Zustand), `logger.ts` (Pino)
- `src/components/ui/` - Shared Shadcn/ui primitives
- `src/hooks/` - Shared client hooks: `use-smart-polling.ts`, `use-infinite-scroll.ts`, `useReducedMotion.ts`
- `src/lib/errors.ts` - Standardized error classes (AppError, ValidationError, etc.)
- `src/lib/error-handlers.ts` - Error handling utilities (toErrorResponse, logError, etc.)
- `messages/` - Translation files (en.json, zh.json) for next-intl
- `tests/` - Unit tests in `unit/`, integration tests in `integration/`, shared fixtures in `fixtures/`

### Module Structure

Each module under `src/modules/` typically follows this layout:

```
src/modules/{domain}/
├── actions.ts       # Public server entrypoint
├── contracts.ts     # Public DTOs/contracts
├── application/     # Use cases, queries, task handlers
├── server-actions/  # Auth/input boundary wrappers
├── ui/              # Module-owned UI
└── hooks/           # Module-owned client hooks
```

### Key Architectural Decisions

**Server Actions over API Routes**: All data mutations use Server Actions. API Routes exist only for NextAuth and a minimal v1 public API.

**Authentication**: OTP (One-Time Password) via email using Resend. Uses NextAuth.js with credentials provider and JWT sessions (30-day max age). Registration can be disabled via `DISABLE_REGISTRATION` env var.

**In-process task runtime** (`src/lib/tasks/`): Background tasks (source-document parsing only) run as in-process Promises via `taskRuntime.submit()`. No Redis or external queue. Task handlers are registered centrally in `src/lib/tasks/task-registry.ts` and initialized from `src/instrumentation.ts`.

**Error Handling**: Use standardized error classes from `src/lib/errors.ts`:

- `AppError` - Base error class with `code`, `statusCode`, and `details`
- `ValidationError` (400), `UnauthorizedError` (401), `ForbiddenError` (403), `NotFoundError` (404), `RateLimitError` (429)
- Use `toErrorResponse(error)` and `getErrorStatusCode(error)` from `src/lib/error-handlers.ts` for consistent API error responses
- Server Actions should throw errors directly (not return `{ success, error }` objects)

**Custom Hooks**: Extract complex component logic into focused hooks:

- `usePendingChanges()` - Track pending form changes with dirty checking
- `useSelection()` - Manage batch selection state (selection mode, selected IDs, select all)
- Place module-specific hooks in `src/modules/{domain}/hooks/`
- Keep hooks under 200 lines; compose smaller hooks for complex logic

**AI pipeline**: Source document parsing uses a "Dual GPT + Arbitration" strategy — two parallel LLM calls compared for consistency, with a third arbitrator call if they disagree. Multi-stage: Stage 1 (pre-analysis) → Stage 1.5 (validation) → Stage 2 (detailed parsing).

**Tenant isolation**: All data queries are scoped to `ledgerId` using `forLedger()` helper. Access is validated via `requireLedgerAccess()`. Soft deletes via `deletedAt` column on all main tables.

**State management**: TanStack Query for server state with centralized query keys (`src/lib/query-keys.ts`). Zustand only for lightweight client state (modal stack). Smart polling (`src/hooks/use-smart-polling.ts`) for monitoring async task completion.

**Optimistic updates**: Mutations use TanStack Query's `onMutate`/`onError`/`onSettled` pattern — never manual `useState` for optimistic state. Always `cancelQueries` before update, save previous data for rollback, and `invalidateQueries` in `onSettled`.

### Testing

- Tests use in-memory SQLite (`:memory:`), no external DB needed
- `fileParallelism: false` in vitest config for DB consistency
- Global mocks in `tests/setup.ts`: `@/lib/db`, `@/auth` (test user `00000000-0000-0000-0000-000000000000`), `next-intl`, `next/cache`
- Prefer integration tests over unit tests for business logic
- Test fixtures in `tests/fixtures/`

### Development Preferences

- Server Actions throw errors directly (no `{ success, error }` result objects)
- Use Zod for validation at system boundaries
- Use skeleton loading states, not spinners
- SQL-level filtering over in-memory filtering
- Batch operations over iterative processing
- Inline editing preferred over modal editing for simple fields
- Icons from Lucide React
- Component files should stay under 300-400 lines; extract custom hooks when exceeding this
- Use `useLedgerMutation` factory (`src/lib/mutations/`) for all mutations — provides unified cancel/snapshot/rollback/invalidate lifecycle
- Always put `invalidateQueries` in `onSettled` (not `onSuccess`) to ensure cache refresh even on error
- Use centralized `queryKeys` factory (`src/lib/query-keys.ts`) and the ledger-scoped invalidation helpers defined there for cache invalidation
- Store dates as `yyyy-MM-dd` strings, never timestamps — frontend owns timezone, backend does string comparison
- Use `metadata` JSONB column for extensible settings instead of adding individual columns
- Prefer minimal infrastructure: in-process over external services, memory store over Redis, polling over SSE
- Domain naming must be precise — invest in renaming when concepts no longer match their actual contract
- **Coding patterns and conventions**: see `docs/architecture/coding-patterns.md` — all agents must read this before modifying existing code or adding new features

## Error Handling

Use standardized error classes from `src/lib/errors.ts`:

```typescript
import { ValidationError, UnauthorizedError, NotFoundError } from "@/lib/errors";
import { toErrorResponse, getErrorStatusCode, logError } from "@/lib/error-handlers";

// Server Actions - throw errors directly
export async function myAction(data: unknown) {
  if (!isValid(data)) {
    throw new ValidationError("Invalid input", { field: "email" });
  }
  // ...
}

// API Routes - use standardized response
export async function POST(request: Request) {
  try {
    // ... logic
  } catch (error) {
    logError("api/my-endpoint", error);
    return NextResponse.json(toErrorResponse(error), { status: getErrorStatusCode(error) });
  }
}
```

## Task Handlers

Task handlers are registered centrally in `src/lib/tasks/task-registry.ts`. Currently only `parse_source_document` is registered.

```typescript
// src/lib/tasks/task-registry.ts
import { parseSourceDocumentTaskDefinition } from "@/modules/source-document/tasks";

registerTaskIfNeeded(
  engine,
  parseSourceDocumentTaskDefinition.type,
  parseSourceDocumentTaskDefinition.handler
);
```

## Custom Hooks

Extract complex component logic into focused hooks:

```typescript
// src/modules/my-feature/hooks/useMyFeature.ts
import { usePendingChanges } from "@/modules/source-document/hooks";
import { useSelection } from "@/hooks/use-selection";

// usePendingChanges - Track pending form changes
const {
  pendingChanges,
  hasPendingChanges,
  pendingChangesCount,
  handleSourceDocChange,
  handleEntryChange,
  discardAllChanges,
  resetChanges,
} = usePendingChanges({ sourceDocument, ledgerEntries });

// useSelection - Manage batch selection
const {
  selectedIds,
  isSelectionMode,
  isAllSelected,
  handleSelect,
  handleSelectAll,
  toggleSelectionMode,
} = useSelection({ allIds: entries.map((e) => e.id) });
```

Place module-specific hooks in `src/modules/{domain}/hooks/`. Keep hooks under 200 lines; compose smaller hooks for complex logic.

### Layering Rules

- Keep `src/app` thin: pages and route handlers should glue together routing, validation, auth, and feature calls without owning business logic.
- Put cross-feature pure helpers, shared schemas, and formatting/parsing utilities in `src/lib`.
- Keep feature-private state helpers and URL coordination inside the owning feature rather than `src/lib` or `src/hooks`.
- Separate pure URL/search-param utilities from navigation side effects (`router.replace`, `window.history`, transitions) instead of mixing them in one helper module.

### Configuration

Copy `.env.example` to `.env.local` and fill in the values you need:

```bash
cp .env.example .env.local
```

- Canonical key list and descriptions: `src/lib/env/catalog.ts`
- Startup validation rules: `src/lib/env/startup.ts`
- Example defaults and comments: `.env.example`
- Durable env governance rules: `docs/architecture/coding-patterns.md`

## Workflow

### Task Completion

After completing a significant task or feature implementation, always ask the user whether to commit and push or continue adjusting. Present options using the `<options>` XML block at the end of the response.
