# API v1 Removal Release Examples

API v1 is authenticated and write-only. Replace placeholders with a release-test credential and a
non-production base URL during rehearsal. Never place a real credential in committed evidence.

## Image ingestion

```http
POST /api/v1/source-documents HTTP/1.1
Authorization: Bearer <service-credential>
Content-Type: application/json

{
  "images": [
    {
      "data": "<base64-image-data>",
      "mimeType": "image/jpeg"
    }
  ],
  "entryDate": "2026-07-01"
}
```

`entryDate` is optional and accepts either `YYYY-MM-DD` or an RFC3339 timestamp. The timestamp is
normalized to the calendar date expressed by its own offset.

```http
HTTP/1.1 201 Created
Content-Type: application/json

{
  "sourceDocumentId": "00000000-0000-4000-8000-000000000001",
  "revisionId": "00000000-0000-4000-8000-000000000002",
  "revisionState": "processing",
  "status": "processing"
}
```

The response must not include a task ID, progress string, local upload URL, storage key, prompt,
raw provider response, or stack trace.

## Negative contract

- `GET /api/v1/source-documents` is not published.
- The retired category, entry, stats, and task API v1 routes are not published.
- Missing or invalid bearer credentials return a sanitized authentication error.
- Invalid JSON or an invalid payload returns a sanitized validation error with field paths.
- Rate-limited requests return a sanitized rate-limit error.
