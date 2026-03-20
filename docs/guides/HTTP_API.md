# HTTP API Guide

This document summarizes the HTTP APIs currently exposed by Cashier.

## Overview

Cashier currently exposes three kinds of HTTP endpoints:

- `Auth.js` endpoints under `/api/auth/*`
- User-session protected file access under `/api/uploads/*`
- Bearer API key endpoints under `/api/v1/*`

Route source of truth:

- [`src/app/api`](/root/workspace/Cashier/src/app/api)

## Authentication

### `/api/v1/*`

These endpoints use service credential authentication.

Send the API key as a Bearer token:

```http
Authorization: Bearer sk_xxx
```

Shared behavior:

- Validates the `Authorization` header
- Validates the service credential
- Applies API rate limiting
- Converts request validation failures into `400 VALIDATION_ERROR`
- Returns a standardized JSON error payload

Shared handler:

- [`src/app/api/v1/_shared/route-helper.ts`](/root/workspace/Cashier/src/app/api/v1/_shared/route-helper.ts)

Standard error shape:

```json
{
  "error": {
    "message": "Missing or invalid Authorization header",
    "code": "UNAUTHORIZED"
  }
}
```

Validation errors use the same envelope:

```json
{
  "error": {
    "message": "Validation failed",
    "code": "VALIDATION_ERROR",
    "details": {
      "issues": []
    }
  }
}
```

### `/api/uploads/*`

These endpoints use the logged-in user session and are intended for browser access to uploaded files.

Auth helper:

- [`src/modules/auth/helpers.ts`](/root/workspace/Cashier/src/modules/auth/helpers.ts)

### `/api/auth/*`

These endpoints are managed by Auth.js / NextAuth.

Route:

- [`src/app/api/auth/[...nextauth]/route.ts`](/root/workspace/Cashier/src/app/api/auth/[...nextauth]/route.ts)

## API Reference

### Auth API

#### `GET|POST /api/auth/[...nextauth]`

Authentication endpoints provided by Auth.js.

Typical subpaths include:

- `/api/auth/signin`
- `/api/auth/signout`
- `/api/auth/session`
- `/api/auth/callback/:provider`

Notes:

- Behavior is owned by Auth.js configuration, not custom route logic
- Used by browser login/session flows

Implementation:

- [`src/app/api/auth/[...nextauth]/route.ts`](/root/workspace/Cashier/src/app/api/auth/[...nextauth]/route.ts)
- [`src/auth.ts`](/root/workspace/Cashier/src/auth.ts)

Related tests:

- [`tests/unit/proxy.test.ts`](/root/workspace/Cashier/tests/unit/proxy.test.ts)

### Uploads API

#### `GET /api/uploads/[...path]`

Serves uploaded files from local storage.

Auth:

- Logged-in user session required

Path format:

- `/api/uploads/:ledgerId/:sourceDocumentId/:filename`

Behavior:

- Rejects path traversal patterns
- Validates path segments
- Reads file from local storage
- Sets `Content-Type` from file extension
- Returns long-lived cache headers

Possible responses:

- `200` file content
- `401` unauthenticated
- `404` invalid path or file not found
- `500` unexpected storage error

Implementation:

- [`src/app/api/uploads/[...path]/route.ts`](/root/workspace/Cashier/src/app/api/uploads/[...path]/route.ts)

Related tests:

- [`tests/unit/lib/storage/local.test.ts`](/root/workspace/Cashier/tests/unit/lib/storage/local.test.ts)
- [`tests/unit/lib/storage/utils.test.ts`](/root/workspace/Cashier/tests/unit/lib/storage/utils.test.ts)

### Service Credential APIs

#### `GET /api/v1/entries`

Query ledger entries.

Query parameters:

- `startDate`: `yyyy-MM-dd`
- `endDate`: `yyyy-MM-dd`
- `categoryId`: UUID
- `currency`: 3-letter currency code
- `cursor`: pagination cursor
- `limit`: `1-100`, default `20`

Response:

- JSON payload returned by `getLedgerEntriesAction`
- Includes `items` and pagination metadata

Implementation:

- [`src/app/api/v1/entries/route.ts`](/root/workspace/Cashier/src/app/api/v1/entries/route.ts)

Tests:

- [`tests/integration/api/v1-query-endpoints.test.ts`](/root/workspace/Cashier/tests/integration/api/v1-query-endpoints.test.ts)

Example:

```bash
curl -H "Authorization: Bearer YOUR_API_KEY" \
  "http://localhost:3000/api/v1/entries?limit=10"
```

#### `GET /api/v1/source-documents`

Query source document list.

Query parameters:

- `status`: `queued | processing | completed | anomaly | failed`
- `startDate`: `yyyy-MM-dd`
- `endDate`: `yyyy-MM-dd`
- `cursor`: pagination cursor
- `limit`: `1-100`, default `20`
- `includeEntries`: `true | false`, default `false`

Response:

- JSON payload returned by `getSourceDocumentsAction`
- Includes `items` and pagination metadata
- `items[*]` uses the list-item DTO, not the full detail DTO
- `items[*].text` is always `null`
- `items[*].imageUrls` is always `[]`
- `items[*].metadata` is always `{}`
- `items[*].hasImages` indicates whether stripped images exist on the full document

Implementation:

- [`src/app/api/v1/source-documents/route.ts`](/root/workspace/Cashier/src/app/api/v1/source-documents/route.ts)

Tests:

- [`tests/integration/api/v1-query-endpoints.test.ts`](/root/workspace/Cashier/tests/integration/api/v1-query-endpoints.test.ts)

Example:

```bash
curl -H "Authorization: Bearer YOUR_API_KEY" \
  "http://localhost:3000/api/v1/source-documents?status=completed&limit=10"
```

#### `POST /api/v1/source-documents`

Create a source document for async processing.

Request body:

- `text?`: string, max `10000`
- `images?`: up to `10` images
- `images[].data`: base64 image data
- `images[].mimeType`: `image/jpeg | image/png | image/gif | image/webp`
- `entryDate?`: `yyyy-MM-dd`
- `timezone?`: string

Rules:

- At least one of `text` or `images` is required
- Per-image max size is `10MB`
- If `entryDate` is omitted, the server resolves it from `timezone` first and falls back to the server date

Response:

- `201` with:

```json
{
  "sourceDocumentId": "uuid",
  "status": "queued",
  "message": "Source document queued for processing"
}
```

Implementation:

- [`src/app/api/v1/source-documents/route.ts`](/root/workspace/Cashier/src/app/api/v1/source-documents/route.ts)

Tests:

- [`tests/integration/api/service-credentials.test.ts`](/root/workspace/Cashier/tests/integration/api/service-credentials.test.ts)

#### `GET /api/v1/stats`

Query ledger statistics.

Query parameters:

- `startDate`: `yyyy-MM-dd`
- `endDate`: `yyyy-MM-dd`
- `categoryId`: UUID
- `currency`: 3-letter currency code

Response:

- JSON payload returned by `getLedgerStatsAction`
- Includes `convertedTotal`, `totals`, `trend`, `byCategory`

Implementation:

- [`src/app/api/v1/stats/route.ts`](/root/workspace/Cashier/src/app/api/v1/stats/route.ts)

Tests:

- [`tests/integration/api/v1-query-endpoints.test.ts`](/root/workspace/Cashier/tests/integration/api/v1-query-endpoints.test.ts)

Example:

```bash
curl -H "Authorization: Bearer YOUR_API_KEY" \
  "http://localhost:3000/api/v1/stats?startDate=2026-03-01&endDate=2026-03-31"
```

#### `GET /api/v1/categories`

Query category list for the credential's ledger.

Query parameters:

- None

Response:

```json
{
  "categories": []
}
```

Implementation:

- [`src/app/api/v1/categories/route.ts`](/root/workspace/Cashier/src/app/api/v1/categories/route.ts)

Tests:

- [`tests/integration/api/v1-query-endpoints.test.ts`](/root/workspace/Cashier/tests/integration/api/v1-query-endpoints.test.ts)

Example:

```bash
curl -H "Authorization: Bearer YOUR_API_KEY" \
  "http://localhost:3000/api/v1/categories"
```

#### `GET /api/v1/task/items`

Query task-center list items.

This is a read-only API. It does not expose cancel, dismiss, retry, or delete operations.

Query parameters:

- None

Response:

```json
{
  "items": [
    {
      "id": "uuid",
      "kind": "task",
      "status": "pending",
      "title": "Pending Task",
      "subtitle": "optional",
      "progress": "optional",
      "createdAt": "2026-03-18T00:00:00.000Z",
      "sourceDocumentId": "optional",
      "taskId": "optional",
      "taskType": "optional"
    }
  ]
}
```

Behavior:

- Includes `pending`, `running`, `failed`
- Includes the latest 5 `completed` tasks
- Includes `anomaly` source documents
- Hides completed tasks whose source document is already in anomaly state

Implementation:

- [`src/app/api/v1/task/items/route.ts`](/root/workspace/Cashier/src/app/api/v1/task/items/route.ts)

Tests:

- [`tests/integration/api/v1-query-endpoints.test.ts`](/root/workspace/Cashier/tests/integration/api/v1-query-endpoints.test.ts)
- [`tests/integration/task-queue/task-queue-actions.test.ts`](/root/workspace/Cashier/tests/integration/task-queue/task-queue-actions.test.ts)

Example:

```bash
curl -H "Authorization: Bearer YOUR_API_KEY" \
  "http://localhost:3000/api/v1/task/items"
```

#### `GET /api/v1/task/stats`

Query task-center aggregate statistics.

This is a read-only API.

Query parameters:

- None

Response:

```json
{
  "stats": {
    "pendingCount": 0,
    "runningCount": 0,
    "failedCount": 0,
    "completedCount": 0,
    "anomalyCount": 0,
    "total": 0,
    "totalInputTokens": 0,
    "totalOutputTokens": 0,
    "avgTokensPerTask": 0
  }
}
```

Behavior:

- `total` excludes completed tasks
- `completedCount` counts all completed tasks, not just the latest 5 shown in `/items`

Implementation:

- [`src/app/api/v1/task/stats/route.ts`](/root/workspace/Cashier/src/app/api/v1/task/stats/route.ts)

Tests:

- [`tests/integration/api/v1-query-endpoints.test.ts`](/root/workspace/Cashier/tests/integration/api/v1-query-endpoints.test.ts)
- [`tests/integration/task-queue/task-queue-actions.test.ts`](/root/workspace/Cashier/tests/integration/task-queue/task-queue-actions.test.ts)

Example:

```bash
curl -H "Authorization: Bearer YOUR_API_KEY" \
  "http://localhost:3000/api/v1/task/stats"
```

## Current Route Inventory

Current `route.ts` files under `src/app/api`:

- [`src/app/api/auth/[...nextauth]/route.ts`](/root/workspace/Cashier/src/app/api/auth/[...nextauth]/route.ts)
- [`src/app/api/uploads/[...path]/route.ts`](/root/workspace/Cashier/src/app/api/uploads/[...path]/route.ts)
- [`src/app/api/v1/categories/route.ts`](/root/workspace/Cashier/src/app/api/v1/categories/route.ts)
- [`src/app/api/v1/entries/route.ts`](/root/workspace/Cashier/src/app/api/v1/entries/route.ts)
- [`src/app/api/v1/source-documents/route.ts`](/root/workspace/Cashier/src/app/api/v1/source-documents/route.ts)
- [`src/app/api/v1/stats/route.ts`](/root/workspace/Cashier/src/app/api/v1/stats/route.ts)
- [`src/app/api/v1/task/items/route.ts`](/root/workspace/Cashier/src/app/api/v1/task/items/route.ts)
- [`src/app/api/v1/task/stats/route.ts`](/root/workspace/Cashier/src/app/api/v1/task/stats/route.ts)
