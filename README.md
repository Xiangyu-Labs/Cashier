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

Local Node development requires Node.js 24, PostgreSQL, and S3-compatible storage. Start the bundled
services, install dependencies, migrate, and run Next.js:

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

PostgreSQL migrations under `src/persistence/postgres-migrations/` are the only schema history.
There is no SQLite runtime or compatibility migration path.

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

Every ledger has a monotonic bigint sync version. Visible tabs request bounded deltas and apply changed canonical documents and tombstones to every loaded filter cache. BroadcastChannel distributes versioned results as an optimization, while polling pauses when hidden or offline and wakes after relevant mutations. The startup preview cache consumes the same protocol; only first use, a retained-log gap, `resetRequired`, or a 24-hour full validation downloads a full snapshot.

### Startup Preview Cache

IndexedDB (`cashier-cache`) stores a short-lived, read-only startup preview: the latest ledger snapshot (up to 1,000 documents) and viewed document image blobs (100 images / 10 MB with LRU eviction). The preview is only shown while the server bootstrap is still loading; the authoritative server data replaces it as soon as it arrives. The first run of this version migrates the legacy `cashier-offline` database and its localStorage key into `cashier-cache`, then removes the old storage; migration failures degrade to an empty cache. The application does not provide offline availability — the service worker precaches only immutable static assets and never serves navigation or cached API responses. TanStack Query and the refresh coordinator still use `navigator.onLine` to avoid request storms while disconnected.
IndexedDB (`cashier-cache`) stores a short-lived, read-only startup preview: the latest ledger snapshot (up to 1,000 documents) and viewed document image blobs (100 images / 10 MB with LRU eviction). The preview is only shown while the server bootstrap is still loading; the authoritative server data replaces it as soon as it arrives. Client caches are disposable and never migrated: a cache-format upgrade invalidates the whole database, and the next startup rebuilds it from the server. The retired `cashier-offline` database and its localStorage key are removed in the background on app load; cleanup failures are non-blocking and retried on a later page load. The application does not provide offline availability — the service worker precaches only immutable static assets and never serves navigation or cached API responses. TanStack Query and the refresh coordinator still use `navigator.onLine` to avoid request storms while disconnected.

### Cache Transaction Model

Optimistic mutations are represented as operation-scoped overlays over canonical Stream entities. Each operation has a unique ID, forward/inverse patches, a base version, and affected projections (`stream`, `counts`, `detail`). A `CacheTransactionManager` maintains the pending operation stack. On server acknowledgment (commit), the operation is removed and later operations replay over the new canonical base. On error (rollback), the failed operation's patches are inverted and surviving operations replay. Targeted invalidation (`invalidateLedgerStats`, `invalidateCalendar`) remains for expensive derived data that cannot be safely patched. The canonical Stream is never invalidated on success if reconciliation succeeded.

### Internal-Breaking Compatibility

Ledger-entry update/delete server actions accept an optional `operationId` parameter and return a parent source-document reconciliation DTO (`MutationReconciliation<SourceDocumentListItemDto>`). This is an internal change only; the public API v1 response contracts remain unchanged. Legacy client-side query keys (`sourceDocumentAttention`, `sourceDocumentCompletedPage`, `sourceDocumentCollection`) and their invalidation predicates have been removed.

### Storage And API

Web images are uploaded directly to private R2 with short-lived signed PUT URLs. The server verifies object MIME type, size, and SHA-256 metadata before copying to a durable key. Reads remain authenticated and stream through `/api/stored-files/:fileId`; API v1 inline images continue using the server-side upload path. `/api/v1` is the stable long-lived public contract and has no scheduled sunset. There is no `/api/v2` route surface.
