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
- `src/features/` - Domain modules: `ai`, `auth`, `currency`, `ledger`, `source-document`, `stats`, `task-queue`, `tasks`. Each self-contained with `server/` (actions, services, schema), `components/`, and `client/` (hooks)
- `src/lib/` - Core infrastructure: `db/` (Drizzle), `flow/` (task engine), `store/` (Zustand), `logger.ts` (Pino)
- `src/components/ui/` - Shared Shadcn/ui primitives
- `src/hooks/` - Shared client hooks: `use-smart-polling.ts`, `use-infinite-scroll.ts`, `useReducedMotion.ts`
- `messages/` - Translation files (en.json, zh.json) for next-intl
- `tests/` - Unit tests in `unit/`, integration tests in `integration/`, shared fixtures in `fixtures/`

### Feature Module Structure
Each feature under `src/features/` follows this layout:
```
src/features/{domain}/
├── server/
│   ├── actions/     # Server Actions (primary API surface)
│   ├── services/    # Business logic
│   ├── tasks/       # Background task handlers (registered in instrumentation.ts)
│   └── schema.ts    # Drizzle ORM table definitions
├── components/      # Feature-specific UI
└── client/hooks/    # Client-side hooks
```

### Key Architectural Decisions

**Server Actions over API Routes**: All data mutations use Server Actions. API Routes exist only for NextAuth and a minimal v1 public API.

**Authentication**: OTP (One-Time Password) via email using Resend. Uses NextAuth.js with credentials provider and JWT sessions (30-day max age). Registration can be disabled via `DISABLE_REGISTRATION` env var.

**In-process task engine** (`src/lib/flow/`): Background tasks (AI parsing, category generation) run as in-process Promises via `flowEngine.submit()`. No Redis or external queue. Task handlers are registered in `src/instrumentation.ts`.

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

### Environment Variables
Required in `.env.local`:

**Database:**
- `DATABASE_URL` - SQLite path (e.g., `file:./data/sqlite.db`)

**OpenAI Configuration:**
- `OPENAI_API_KEY` - Your OpenAI API Key
- `OPENAI_BASE_URL` - (Optional) Custom Base URL for proxies or compatible APIs
- `AI_MODEL_FAST` - Fast model for high-volume extraction (e.g., `gpt-4o-mini`, needs vision)
- `AI_MODEL_SMART` - Smart model for arbitration/validation (e.g., `gpt-4o`, needs vision)
- `AI_MODEL_TEXT` - Text-only model for categorization (e.g., `gpt-4o-mini`, no vision needed)
- `AI_MAX_RETRIES` - (Optional) Max retry attempts, default 3
- `AI_RETRY_DELAY_MS` - (Optional) Retry delay in ms, default 1000

**Authentication:**
- `AUTH_SECRET` - Secret key for signing cookies and tokens
- `AUTH_URL` - Base URL for auth callbacks (e.g., `http://localhost:3000`)
- `AUTH_RESEND_KEY` - Resend API key for OTP emails
- `AUTH_EMAIL_FROM` - Email address for sending OTPs
- `AUTH_RATE_LIMIT_MAX` - (Optional) Max login attempts, default 5
- `AUTH_RATE_LIMIT_WINDOW` - (Optional) Rate limit window in seconds, default 60
- `DISABLE_REGISTRATION` - (Optional) Set to 'true' to disable new registrations

**App Configuration:**
- `NEXT_PUBLIC_APP_URL` - Public app URL for frontend
- `APP_DOMAIN` - (Optional) Application domain
- `LOG_LEVEL` - (Optional) Logging level (debug, info, warn, error), default info
- `MAX_TASK_WORKER` - (Optional) Maximum concurrent background tasks, default 10

## Workflow

### Task Completion
After completing a significant task or feature implementation, always ask the user whether to commit and push or continue adjusting. Present options using the `<options>` XML block at the end of the response.
