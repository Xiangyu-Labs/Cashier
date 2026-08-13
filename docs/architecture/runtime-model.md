# Runtime Model

This document describes Cashier's current processing and client-cache boundaries. It is intended
for contributors, not as a deployment guarantee.

## Source-document processing

- Vercel and Docker use the same application path.
- A submission creates a durable processing intent and schedules work with Next.js `after()`.
- There is no global drain loop, cron process, external queue, or continuously running worker.
- Processing intents use idempotent dispatch, claim leases, and lease renewal.
- On Vercel, processing remains bounded by the function `maxDuration`; Docker does not impose that
  serverless lifecycle limit.

`POST /api/v1/source-documents` returns `201` only after image processing, object upload, and
database persistence finish. It does not wait for AI parsing. If parsing fails or the request
lifecycle ends, the intent remains recoverable. The next upload, ledger query, or Stream refresh
for that ledger can claim pending work. With no later request, recovery does not run automatically.

Cancelling a delivered HTTP request does not undo a completed upload. API clients should reuse the
same `Idempotency-Key` when retrying a create request.

## Unified Stream

The ledger home shows one Stream containing queued, processing, anomaly, duplicate-review, failed,
and completed source documents. Server-side keyset pagination orders records by
`entryDate DESC, createdAt DESC, id DESC`; the browser preserves server order.

## Refresh ownership

Each ledger has a monotonic bigint sync version. Visible tabs request bounded deltas and apply
canonical changed documents and tombstones to loaded filter caches. `BroadcastChannel` distributes
versioned results as an optimization. Polling pauses while the page is hidden or offline and wakes
after relevant mutations.

A full snapshot is fetched on first use, after a retained-log gap or `resetRequired`, and during the
periodic full validation. Delta refresh remains authoritative between snapshots.

## Startup preview cache

IndexedDB database `cashier-cache` stores a short-lived, read-only startup preview:

- The latest ledger snapshot, bounded by `LEDGER_STARTUP_CACHE_DOCUMENT_LIMIT`.
- Viewed document image blobs, bounded to 100 images and 10 MiB with LRU eviction.

The preview is shown only while server bootstrap is loading and is replaced by authoritative server
data. Cache-format changes invalidate the local database rather than migrating it.

Cashier does not provide offline availability. The service worker precaches immutable assets but
does not serve navigation requests or cached API responses.

## Optimistic cache transactions

Client mutations are operation-scoped overlays over canonical Stream entities. Each operation has
an ID, forward and inverse patches, a base version, and affected projections.

On commit, the acknowledged operation is removed and later operations replay over the new canonical
base. On rollback, the failed patch is inverted and surviving operations replay. Expensive derived
data such as statistics and calendar totals can still use targeted invalidation.

## Storage boundaries

Web images upload directly to private S3-compatible storage with short-lived signed PUT URLs. The
server verifies MIME type, size, and SHA-256 metadata before copying an upload to its durable key.
Authenticated reads stream through `/api/stored-files/{fileId}`.

API v1 inline images use the server-side upload path. The public v1 response contract is independent
of internal server-action reconciliation DTOs.
