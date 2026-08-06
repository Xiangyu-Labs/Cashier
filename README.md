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

## Processing

Source document parsing (AI-powered receipt/expense extraction) uses the following architecture:

- **Hosting**: Vercel and Docker are both supported first-class deployment targets. Production currently runs on Vercel.
- **Scheduling**: Processing is scheduled via Next.js `after()` at request boundaries — runs after the HTTP response is sent, no blocking.
- **No global drain loop**: Each submission creates a processing intent and executes it directly. No background worker or external queue drains pending rows.
- **Idempotency**: Processing intents support idempotent dispatch, claim-based concurrency control, and lease expiry to handle restarts.
- **Runtime boundary**: `after()` uses the same application path on Vercel and Docker. On Vercel it remains bounded by the Function `maxDuration`; Docker packaging does not impose that serverless lifecycle limit.

### Request-bound reliability boundary

API v1 returns `201` only after image processing, R2 upload, and database
persistence complete — it does **not** wait for AI parsing. Parsing is scheduled
with Next.js `after()` and a PostgreSQL durable outbox with claim leases and
heartbeat renewal. If the AI call fails or the serverless lifecycle cuts the
request short, the pending intent stays recoverable and is re-claimed by the
next upload, app query, or Stream refresh for the same ledger. With no new
request at all, recovery does not happen automatically — there is no cron,
worker, or external queue by design.

Cancelling the HTTP request after it was delivered does not undo the upload:
the server may still report the document later. For at-most-once creation,
send the same `Idempotency-Key` header on retries; a replayed key returns the
already-created document instead of creating a second one.

### Storage maintenance

`npm run prune` removes provably unreferenced database/runtime data and R2
objects. It is **dry-run by default** and deletes nothing unless `--apply` is
passed. Soft-deleted source documents and their revisions are never touched.

```bash
npm run prune                       # scan + summary only
npm run prune -- --apply            # delete what the scan found
npm run prune -- --json --batch-size 500 --orphan-grace-days 14 --temporary-grace-hours 48
```

What it cleans:

- Expired rate-limit buckets, OTP tokens, idempotency records, upload
  sessions, change-log batches, and stale object-cleanup jobs.
- `stored_files` older than `--orphan-grace-days` (default 7) with no
  `revision_files` or valid upload-session reference: the database row is
  claimed with a reference recheck, then the R2 object is removed. A failed
  object delete leaves a durable orphan that the next prune removes.
- Durable R2 objects older than the grace period with no `stored_files` row
  at all.
- `temporary/*` objects older than `--temporary-grace-hours` (default 24)
  that no open/finalizing upload session references.

Rows whose R2 object is already missing are reported (`missingObjects`) and
kept, never auto-deleted. A PostgreSQL advisory lock serialises prune runs
against each other and maintenance.

## License

Private

## Architecture Notes

### Unified Stream Page

The ledger home displays a single unified Stream of source documents across all statuses (queued, processing, anomaly, completed). This replaces the earlier split between an "attention" (limited) and "completed" (paginated) collection. A single server-side keyset cursor, ordered by `entryDate DESC, createdAt DESC, id DESC`, drives infinite scrolling with exactly 20 items per page. The browser preserves server order and does not re-sort.

### Refresh Ownership

Every ledger has a monotonic bigint sync version. Visible tabs request bounded deltas and apply changed canonical documents and tombstones to every loaded filter cache. BroadcastChannel distributes versioned results as an optimization, while polling pauses when hidden or offline and wakes after relevant mutations. The startup preview cache consumes the same protocol; only first use, a retained-log gap, `resetRequired`, or a 24-hour full validation downloads a full snapshot.

### Startup Preview Cache

IndexedDB (`cashier-cache`) stores a short-lived, read-only startup preview: the latest ledger snapshot (up to 1,000 documents) and viewed document image blobs (100 images / 10 MB with LRU eviction). The preview is only shown while the server bootstrap is still loading; the authoritative server data replaces it as soon as it arrives. Client caches are disposable and never migrated: a cache-format upgrade invalidates the whole database, and the next startup rebuilds it from the server. The application does not provide offline availability — the service worker precaches only immutable static assets and never serves navigation or cached API responses. TanStack Query and the refresh coordinator still use `navigator.onLine` to avoid request storms while disconnected.

### Cache Transaction Model

Optimistic mutations are represented as operation-scoped overlays over canonical Stream entities. Each operation has a unique ID, forward/inverse patches, a base version, and affected projections (`stream`, `counts`, `detail`). A `CacheTransactionManager` maintains the pending operation stack. On server acknowledgment (commit), the operation is removed and later operations replay over the new canonical base. On error (rollback), the failed operation's patches are inverted and surviving operations replay. Targeted invalidation (`invalidateLedgerStats`, `invalidateCalendar`) remains for expensive derived data that cannot be safely patched. The canonical Stream is never invalidated on success if reconciliation succeeded.

### Internal-Breaking Compatibility

Ledger-entry update/delete server actions accept an optional `operationId` parameter and return a parent source-document reconciliation DTO (`MutationReconciliation<SourceDocumentListItemDto>`). This is an internal change only; the public API v1 response contracts remain unchanged. Legacy client-side query keys (`sourceDocumentAttention`, `sourceDocumentCompletedPage`, `sourceDocumentCollection`) and their invalidation predicates have been removed.

### Storage And API

Web images are uploaded directly to private R2 with short-lived signed PUT URLs. The server verifies object MIME type, size, and SHA-256 metadata before copying to a durable key. Reads remain authenticated and stream through `/api/stored-files/:fileId`; API v1 inline images continue using the server-side upload path. `/api/v1` is the stable long-lived public contract and has no scheduled sunset. There is no `/api/v2` route surface. Mobile and automation clients should reuse the same `Idempotency-Key` when retrying a `POST /api/v1/source-documents` so a network retry cannot create duplicate documents or files; every API v1 response includes an `X-Request-Id` header that can be used for request correlation.

### Public API v1 Contract

`POST /api/v1/source-documents` and `GET /api/v1/source-documents/{id}` accept `Authorization: Bearer <token>` (scheme matching is case-insensitive). Successful credential-limited responses carry `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset` (Unix seconds); `429` responses add `Retry-After` plus the same three headers. `401` responses include `WWW-Authenticate: Bearer`. A successful `POST` returns `201` with a relative `Location: /api/v1/source-documents/{sourceDocumentId}` header.

The optional `Idempotency-Key` header must contain between 1 and 512 characters and may not be all whitespace. The value is validated before the request body is read and is never trimmed or normalized, so retries must send the exact original value. An invalid key returns `400` without reading or uploading the request content.

Rate limits are fixed 60-second windows backed by PostgreSQL. `API_RATE_LIMIT_PER_MINUTE` (default `60`) is a per-credential quota shared by `POST` and `GET` across all client IPs. When `TRUSTED_PROXY` is configured, a pre-authentication per-IP ceiling of 120 requests/minute protects authentication work, and invalid bearer attempts are capped at 30/minute per IP and token shard.

The completed status projection reports accounting totals in the ledger's main currency: `result.total` is the sum of the selected revision's `convertedAmount` values and `result.totalCurrency` is the ledger's three-letter ISO main currency (for example `"12.50"` with `"CNY"`). The entries array keeps the original `amount` and `currency` per line and does not expose `convertedAmount`. If a completed revision contains an entry without an accounting amount, the endpoint returns a sanitized `500` rather than mixing raw currencies.
