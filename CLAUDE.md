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
npm run docker:dev       # Dev with hot reload
npm run docker:build     # Build Docker image
npm run docker:prod      # Production deployment
npm run docker:down      # Stop containers
```

## Architecture

### Directory Structure

- `src/app/[locale]/` - Next.js App Router with i18n (next-intl). All routes are locale-prefixed.
- `src/app/[locale]/(protected)/` - Auth-protected routes (ledger, admin, settings)
- `src/modules/` - Domain modules: `auth`, `currency`, `ledger`, `source-document`, `stats`, `task-queue`, `workspace`. Each module owns its contracts, application logic, public entrypoints, and module-specific UI/hooks
- `src/lib/` - Core infrastructure: `db/` (Drizzle), `flow/` (task engine), `store/` (Zustand), `logger.ts` (Pino)
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

**In-process task engine** (`src/lib/flow/`): Background tasks (AI parsing, category generation) run as in-process Promises via `flowEngine.submit()`. No Redis or external queue. Task handlers are registered centrally in `src/lib/flow/task-registry.ts` and initialized from `src/instrumentation.ts`.

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
- Use centralized `queryKeys` factory (`src/lib/query-keys.ts`) and `invalidateLedgerCache()` predicate for cache invalidation
- Store dates as `yyyy-MM-dd` strings, never timestamps — frontend owns timezone, backend does string comparison
- Use `metadata` JSONB column for extensible settings instead of adding individual columns
- Prefer minimal infrastructure: in-process over external services, memory store over Redis, polling over SSE
- Domain naming must be precise — invest in renaming if concepts don't match (see `docs/dev-preferences.md` for full evolution history)

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

Task handlers live in `src/modules/*/application/tasks/` and must be registered in `src/lib/flow/task-registry.ts`.

```typescript
// src/modules/my-feature/application/tasks/my-task.ts
import { flowEngine } from "@/lib/flow";

export default function register(engine: typeof flowEngine) {
  engine.register("my-task", {
    async execute(input, context) {
      // Task logic
      return result;
    },
  });
}
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

### Environment Variables

Configuration is organized into three tiers:

#### 1. System Configuration (`.env.local`)

Sensitive and startup-required settings. **Never expose to frontend.**

**Database:**

- `DATABASE_URL` - SQLite path (e.g., `file:./data/sqlite.db`)

**OpenAI:**

- `OPENAI_API_KEY` - Your OpenAI API Key
- `OPENAI_BASE_URL` - (Optional) Custom Base URL for proxies
- `AI_MODEL_TEXT` - Text model for business logic (default: `gpt-4o-mini`)
- `AI_MODEL_VISION` - Vision model for image description (default: `gpt-4o`)
- `AI_MAX_RETRIES` - Max retry attempts (default: 3)
- `AI_RETRY_DELAY_MS` - Retry delay in ms (default: 1000)

**Authentication:**

- `AUTH_SECRET` - Secret key for signing cookies and tokens
- `AUTH_RESEND_KEY` - Resend API key for OTP emails
- `AUTH_EMAIL_FROM` - Email address for sending OTPs
- `DISABLE_REGISTRATION` - Set to 'true' to disable new registrations
- `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` - (Optional) SSO configuration

**Storage & Network:**

- `LOCAL_STORAGE_PATH` - Local file storage path (default: `./data/uploads`)
- `TRUSTED_PROXY` - (Optional) Trusted proxy for IP extraction

#### 2. Runtime Configuration (`.env.local` → Future: Admin Panel)

Business logic settings. Currently in `.env`, future migration to admin panel.

**OTP Settings:**

- `OTP_EXPIRES_SECONDS` - OTP expiration time (default: 300)
- `OTP_LOCKOUT_MINUTES` - Account lockout duration (default: 15)
- `OTP_MAX_ATTEMPTS` - Max verification attempts (default: 5)
- `OTP_RESEND_COOLDOWN_SECONDS` - Resend cooldown (default: 60)
- `AUTH_RATE_LIMIT_MAX` - Max OTP sends per window (default: 10)
- `AUTH_RATE_LIMIT_WINDOW` - Rate limit window in seconds (default: 900)

**System Settings:**

- `LOG_LEVEL` - Logging level (default: `info`)
- `MAX_TASK_WORKER` - Max concurrent background tasks (default: 10)

#### 3. Frontend Configuration (Build-time)

Exposed to browser via `NEXT_PUBLIC_` prefix. **Requires rebuild to change.**

- `NEXT_PUBLIC_APP_URL` - Public app URL
- `NEXT_PUBLIC_OIDC_ENABLED` - Show SSO button (default: `false`)
- `NEXT_PUBLIC_OIDC_BUTTON_NAME` - SSO button text (default: `SSO`)

## Workflow

### Task Completion

After completing a significant task or feature implementation, always ask the user whether to commit and push or continue adjusting. Present options using the `<options>` XML block at the end of the response.
