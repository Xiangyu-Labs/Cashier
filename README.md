# Cashier - AI Intelligent Bookkeeping Assistant

Cashier is a modern, AI-powered bookkeeping application designed to streamline personal finance management. It uses advanced LLMs to parse receipts and invoices, automatically categorizing and recording expenses.

## Features

- **AI-Powered Entry**: Upload a receipt or type a natural language description, and Cashier extracts dates, amounts, merchants, and items.
- **Self-hosted authentication**: Password login works without email; Resend-backed OTP is optional.
- **Multi-Currency**: Automatic currency conversion and management.
- **Service Credentials**: Create scoped API credentials for automation against the current ledger.

## Tech Stack

- **Framework**: [Next.js 16](https://nextjs.org/) (App Router)
- **Database**: PostgreSQL via [Drizzle ORM](https://orm.drizzle.team/)
- **Auth**: [Auth.js v5](https://authjs.dev/) (NextAuth)
- **UI**: Tailwind CSS, Radix UI, Shadcn/ui
- **AI**: OpenAI / LLM Integration

## Docker

Docker and Docker Compose are the only prerequisites. Choose one explicit mode.

### Bundled local stack

```bash
cp .env.local.example .env
npm run docker:local
```

This starts the app, PostgreSQL, MinIO, and the one-shot `storage-bootstrap` bucket creator. The
PostgreSQL and MinIO credentials are fixed local-only values and must not be used for external
services.

### External Neon / R2

```bash
cp .env.example .env
# Fill DATABASE_URL and every S3 credential; create the bucket first.
npm run docker:external
```

External mode starts only `app`; it never creates PostgreSQL, MinIO, or initialization containers.
Both modes apply migrations, generate stable Auth/API internal secrets in `cashier_config`, and
create the initial user when the database is empty. External S3/R2 credentials are never generated.

Open [http://localhost:3000](http://localhost:3000). The initial password is never synchronized
again and may be removed from `.env` after the first successful start.

Set `AUTH_RESEND_KEY` to enable email-code login and registration. Without it, the login page only
shows password login.

### Docker Commands

| Command                   | Description                      |
| ------------------------- | -------------------------------- |
| `npm run docker:local`    | Start app + PostgreSQL + MinIO   |
| `npm run docker:external` | Start app with external services |
| `npm run docker:prod`     | Alias for `docker:external`      |
| `npm run docker:build`    | Build production image only      |
| `npm run docker:down`     | Stop and remove containers       |

Application data lives in the `cashier_postgres`, `cashier_minio`, and `cashier_config` named
volumes. `npm run docker:down` preserves them; adding `-v` to the underlying Compose command
permanently removes them.

## Local Development

Local Node development requires PostgreSQL and S3-compatible storage. Start the bundled services,
install dependencies, migrate, and run Next.js:

```bash
npm install
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d postgres minio storage-bootstrap
npm run db:migrate
npm run dev
```

Ignored files such as `.env`, `.env.local`, and `.env.r2.local` are not changed by this migration.
After confirming the new `.env` works, obsolete local copies can be archived manually.

## Testing

Integration tests use the PostgreSQL service from `docker-compose.test.yml`.

```bash
npm run test        # Watch mode
npm run test:run    # Single run
npm run test:coverage  # With coverage
```

## Documentation

- [CLAUDE.md](./CLAUDE.md) - Working conventions for agents in this repository
- [docs/operations/runbook.md](./docs/operations/runbook.md) - Operations runbook for local running, migrations, backup, and deployment

## Processing

Source document parsing (AI-powered receipt/expense extraction) uses the following architecture:

- **Hosting**: Vercel and Docker are both supported first-class deployment targets. Production currently runs on Vercel.
- **Scheduling**: Processing is scheduled via Next.js `after()` at request boundaries — runs after the HTTP response is sent, no blocking.
- **No global drain loop**: Each submission creates a processing intent and executes it directly. No background worker or external queue drains pending rows.
- **Idempotency**: Processing intents support idempotent dispatch, claim-based concurrency control, and lease expiry to handle restarts.
- **Runtime boundary**: `after()` uses the same application path on Vercel and Docker. On Vercel it remains bounded by the Function `maxDuration`; Docker packaging does not impose that serverless lifecycle limit.

## License

Private

## Architecture Notes

### Unified Stream Page

The ledger home displays a single unified Stream of source documents across all statuses (queued, processing, anomaly, completed). This replaces the earlier split between an "attention" (limited) and "completed" (paginated) collection. A single server-side keyset cursor, ordered by `entryDate DESC, createdAt DESC, id DESC`, drives infinite scrolling with exactly 20 items per page. The browser preserves server order and does not re-sort.

### Refresh Ownership

Every visible eligible tab independently runs a bounded refresh cycle for its active filter signatures and watched source-document IDs, returning only changed canonical data. BroadcastChannel-based leadership still distributes versioned results as a cache optimization, but it does not gate local refreshes. Polling pauses when hidden/offline, wakes after relevant mutations, and uses jittered backoff.

### Cache Transaction Model

Optimistic mutations are represented as operation-scoped overlays over canonical Stream entities. Each operation has a unique ID, forward/inverse patches, a base version, and affected projections (`stream`, `counts`, `detail`). A `CacheTransactionManager` maintains the pending operation stack. On server acknowledgment (commit), the operation is removed and later operations replay over the new canonical base. On error (rollback), the failed operation's patches are inverted and surviving operations replay. Targeted invalidation (`invalidateLedgerStats`, `invalidateCalendar`) remains for expensive derived data that cannot be safely patched. The canonical Stream is never invalidated on success if reconciliation succeeded.

### Internal-Breaking Compatibility

Ledger-entry update/delete server actions accept an optional `operationId` parameter and return a parent source-document reconciliation DTO (`MutationReconciliation<SourceDocumentListItemDto>`). This is an internal change only; the public API v1 response contracts remain unchanged. Legacy client-side query keys (`sourceDocumentAttention`, `sourceDocumentCompletedPage`, `sourceDocumentCollection`) and their invalidation predicates have been removed.
