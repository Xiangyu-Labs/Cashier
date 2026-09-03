# Runtime Model

This document describes Cashier's current processing and client refresh boundaries. It is intended
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

Each ledger has a monotonic bigint sync version. Stream and detail observers share one ledger-scoped
React Query refresh request. The server summarizes all retained change batches after the observer's
version in one query, including category, settings, and statistics invalidation flags.

The summary also reports whether processing documents remain. While transitional work exists,
visible pages poll every three seconds; background polling is disabled, and focus or reconnect
triggers a refresh. Invalid or future versions, retained-log gaps, and `resetRequired` batches cause
the client to invalidate all affected ledger projections instead of assuming a continuous history.

React Query request deduplication gives multiple Stream and detail observers a single in-flight
refresh per ledger. Stream keyset generation and restart checks remain responsible for pagination
cursor consistency.

## Client caching

Cashier does not provide offline availability. The service worker precaches immutable assets but
does not serve navigation requests or cached API responses.

Source-document images are not persisted in IndexedDB or a service-worker cache. Every view uses the
authenticated `/api/stored-files/{fileId}` route, whose responses use `Cache-Control: private,
no-store`. Reopening an image therefore performs a new authorized read. On the first startup after
upgrading from the former persistent image-cache implementation, the browser deletes the retired
`cashier-cache` IndexedDB database.

## Storage boundaries

Web images upload directly to private S3-compatible storage with short-lived signed PUT URLs. The
server verifies MIME type, size, and SHA-256 metadata before copying an upload to its durable key.
Authenticated reads stream through `/api/stored-files/{fileId}`.

API v1 inline images use the server-side upload path. The public v1 response contract is independent
of internal server-action reconciliation DTOs.
