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

## Docker Quick Start

Docker and Docker Compose are the only prerequisites. Prepare the compact environment file:

```bash
cp .env.example .env
```

Review the five values in `QUICK START` (email, password, API key, base URL, and model), then start
the complete stack:

```bash
docker compose up -d
```

Open [http://localhost:3000](http://localhost:3000). Compose starts PostgreSQL and MinIO,
creates the private bucket, applies database migrations, generates internal secrets, and creates the
initial user when the database is empty. The initial password is never synchronized again and may be
removed from `.env` after the first successful start.

Set `AUTH_RESEND_KEY` to enable email-code login and registration. Without it, the login page only
shows password login. External PostgreSQL or S3-compatible services can be configured in the
commented `EXTERNAL SERVICES` section of `.env.example`.

### Docker Commands

| Command                | Description                         |
| ---------------------- | ----------------------------------- |
| `npm run docker:prod`  | Start the complete production stack |
| `npm run docker:build` | Build production image only         |
| `npm run docker:down`  | Stop and remove containers          |

Application data lives in the `cashier_postgres`, `cashier_minio`, and `cashier_config` named
volumes. `docker compose down` preserves them; `docker compose down -v` permanently removes them.

## Local Development

Local Node development requires PostgreSQL and S3-compatible storage. Start the bundled services,
install dependencies, migrate, and run Next.js:

```bash
npm install
docker compose up -d postgres minio minio-init
npm run db:migrate
npm run dev
```

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

- **Hosting**: Currently Docker. The runtime is Vercel-compatible and will migrate when production-ready.
- **Scheduling**: Processing is scheduled via Next.js `after()` at request boundaries — runs after the HTTP response is sent, no blocking.
- **No global drain loop**: Each submission creates a processing intent and executes it directly. No background worker or external queue drains pending rows.
- **Idempotency**: Processing intents support idempotent dispatch, claim-based concurrency control, and lease expiry to handle restarts.
- **Vercel-compatible**: The `after()`-based scheduling works within Vercel's serverless runtime without modification. If `maxDuration` limits are insufficient, a Queue/Worker path is designed but deferred until measured.

## License

Private

## Architecture Notes

### Unified Stream Page

The ledger home displays a single unified Stream of source documents across all statuses (queued, processing, anomaly, completed). This replaces the earlier split between an "attention" (limited) and "completed" (paginated) collection. A single server-side keyset cursor, ordered by `entryDate DESC, createdAt DESC, id DESC`, drives infinite scrolling with exactly 20 items per page. The browser preserves server order and does not re-sort.

### Refresh Ownership

One visible eligible tab owns network work per ledger via BroadcastChannel-based leadership. The leader runs a bounded refresh cycle for distinct active filter signatures and watched source-document IDs, returning only changed canonical data. Followers receive versioned distribution messages. Polling pauses when hidden/offline, wakes after relevant mutations, and uses jittered backoff.

### Cache Transaction Model

Optimistic mutations are represented as operation-scoped overlays over canonical Stream entities. Each operation has a unique ID, forward/inverse patches, a base version, and affected projections (`stream`, `counts`, `detail`). A `CacheTransactionManager` maintains the pending operation stack. On server acknowledgment (commit), the operation is removed and later operations replay over the new canonical base. On error (rollback), the failed operation's patches are inverted and surviving operations replay. Targeted invalidation (`invalidateLedgerStats`, `invalidateCalendar`) remains for expensive derived data that cannot be safely patched. The canonical Stream is never invalidated on success if reconciliation succeeded.

### Internal-Breaking Compatibility

Ledger-entry update/delete server actions accept an optional `operationId` parameter and return a parent source-document reconciliation DTO (`MutationReconciliation<SourceDocumentListItemDto>`). This is an internal change only; the public API v1 response contracts remain unchanged. Legacy client-side query keys (`sourceDocumentAttention`, `sourceDocumentCompletedPage`, `sourceDocumentCollection`) and their invalidation predicates have been removed.
