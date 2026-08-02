# Private R2 storage operations

Cashier uses a private Cloudflare R2 bucket. Web clients upload images with short-lived signed PUT
URLs; reads stream through the authenticated `/api/stored-files/:fileId` route. No public bucket,
custom public domain, browser credential, or Cloudflare Worker is required.

## Runtime configuration

Create an Object Read & Write token scoped to the Cashier bucket and configure the server:

```dotenv
APP_URL=https://cashier.example.com
S3_ENDPOINT=https://account-id.r2.cloudflarestorage.com
S3_PUBLIC_ENDPOINT=https://account-id.r2.cloudflarestorage.com
S3_REGION=auto
S3_BUCKET=cashier
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
S3_FORCE_PATH_STYLE=false
```

These credentials sign uploads, verify them with HEAD, copy verified objects to durable keys, stream
reads, and delete temporary objects. Never expose them to the browser or logs.

## CORS and lifecycle

Allow only the exact `APP_URL` origin. Add localhost separately for local development; do not use
`*` or ephemeral preview origins.

```json
[
  {
    "AllowedOrigins": ["https://cashier.example.com"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["content-type", "x-amz-meta-sha256"],
    "ExposeHeaders": ["etag"],
    "MaxAgeSeconds": 3600
  }
]
```

Configure a lifecycle rule that deletes the `temporary/` prefix after one day. Request-bound
maintenance also removes terminal upload sessions and their temporary objects after 24 hours, but
the bucket rule is the final guard for abandoned uploads and interrupted execution.

## Upload protocol

1. The browser compresses each image and calculates SHA-256.
2. The server creates an upload session and signs a temporary PUT requiring `Content-Type` and
   `x-amz-meta-sha256`.
3. The browser PUTs directly to R2.
4. Finalization uses HEAD to verify MIME type, byte size, and SHA-256 metadata, then copies to
   `<ledger-id>/stored/<file-id>` and records the opaque stored-file ID.
5. API v1 inline data images continue through the server-side upload capability.

Failed validation never promotes the temporary object. Repeating finalize is idempotent for the
same session and target ordering. Expired or old active sessions from a previous release are not
compatible and users must upload again.

## Release and recovery

Before a breaking database/storage release, validate a signed PUT from `APP_URL`, HEAD/copy/delete,
an authenticated read, an unauthorized 404, and the one-day lifecycle rule. Stop application
writes and back up PostgreSQL before migration.

The destructive schema migration cannot be rolled back independently. Recovery means restoring the
pre-migration PostgreSQL backup and deploying the previous image. Durable R2 objects are preserved;
do not bulk-delete them during rollback.
