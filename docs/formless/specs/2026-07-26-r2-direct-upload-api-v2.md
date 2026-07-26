# R2 Direct Upload and API v2 Specification

## Problem

Cashier's browser upload plan currently returns an authenticated Vercel Route Handler URL. The browser sends every image to that route, the Function buffers the complete request body, and the Function then writes the bytes to private R2. This `browser -> Vercel -> R2` data path consumes Vercel request bandwidth and memory, remains constrained by Vercel request-body limits, and adds an unnecessary network hop.

The published API v1 accepts inline image data and already has compatibility and idempotency behavior that must not change. A new API version is required for external clients that can upload image bytes directly to R2 without breaking v1 consumers.

## Goals

- Make browser image submissions transfer bytes directly from the browser to private R2 through short-lived presigned PUT URLs.
- Add an authenticated API v2 direct-upload protocol while leaving every API v1 request and response contract unchanged.
- Keep text-only browser and API v2 submissions free of upload-session overhead.
- Verify each uploaded object's expected size, content type, and client-computed SHA-256 metadata before it becomes a finalized stored file.
- Keep upload planning, finalization, ownership checks, file ordering, limits, and retry behavior shared between the browser and API v2.
- Preserve source-document creation, processing, and response semantics after stored files have been finalized.

## Non-Goals

- Changing, deprecating, redirecting, or internally reinterpreting `POST /api/v1/source-documents`.
- Making the R2 bucket or any stored object public.
- Switching authenticated image reads to presigned GET URLs.
- Adding a Cloudflare Worker or moving image parsing out of the existing processing runtime.
- Allowing API v2 clients to select R2 object keys, bucket names, ACLs, or arbitrary upload headers.
- Raising the existing Web upload file-count, byte-size, aggregate-size, MIME-type, text-length, or pixel limits.

## Background

The browser already follows a three-stage control flow in `source-document-submission-upload.ts`: create an upload plan, PUT every image to the returned target, and finalize the upload session before creating the source document. The current `StoredFileAdapter` returns `/api/stored-files/upload-targets/{sessionId}/{targetId}` targets, so image bytes still pass through Vercel. That route buffers `request.arrayBuffer()` and calls the R2 storage adapter.

Upload sessions and their ordered targets are stored in Postgres. They carry ledger ownership, expected MIME type and byte size, optional SHA-256, a 15-minute expiry, and a hashed finalization token. Stored files use private R2 keys under `{ledgerId}/stored/{storedFileId}`. The current R2 adapter supports put, get, and delete, but not presigning, metadata inspection, or server-side copy.

API v1 is a single authenticated JSON endpoint. It accepts inline image content, processes it inside the Vercel runtime, uses the existing stored-file operations internally, and namespaces idempotency records with `api-v1:`. API v2 is additive and must use a separate `api-v2:` idempotency namespace.

## Decisions

### Versioning and Compatibility

**Choice:** Add API v2 routes and contracts without modifying API v1 files, schemas, limits, idempotency namespace, response compatibility fields, or tests except for explicit regression assertions that v1 remains unchanged.

**Rationale:** Existing API clients keep their current behavior while new clients can opt into a protocol designed around direct object upload.

### API v2 Protocol

**Choice:** Publish `POST /api/v2/uploads` to create an upload session and `POST /api/v2/source-documents` to finalize an optional upload session and create the source document. Both routes use the existing service-credential authentication and rate-limiting boundary. Text-only creation calls the source-document endpoint without an upload session.

**Rationale:** Separating planning from submission lets clients send bytes directly to R2 while keeping the final business mutation authenticated, bounded, and idempotent.

### Browser Integration

**Choice:** Keep the browser on its existing internal Server Action boundary, but make that action return the same real R2 presigned targets used by API v2. The browser does not call the public API v2 or use a service credential.

**Rationale:** Both callers share one storage workflow without coupling the signed-in Web application to the external API authentication contract.

### Temporary Object Capabilities

**Choice:** Each target is a 15-minute SigV4 presigned PUT for one server-generated key under a private `temporary/{ledgerId}/{sessionId}/{targetId}` prefix. It is bound to the declared `Content-Type` and an `x-amz-meta-sha256` SHA-256 hex value. The response never exposes credentials or a reusable key-signing capability.

**Rationale:** A leaked URL has limited lifetime, method, key, and metadata scope. Temporary keys prevent an unfinalized browser write from becoming durable application data.

### Checksum Ownership

**Choice:** Browser and API v2 clients compute SHA-256 over the exact bytes they will PUT before requesting an upload plan. The checksum is required for direct-upload plans, stored with the target, included as signed R2 object metadata, and compared during finalization. API v1 retains its current internal checksum behavior.

**Rationale:** The server cannot hash direct-upload bytes without downloading them. Requiring a signed metadata value provides transfer consistency and binds finalization to the planned artifact, while downstream byte inspection remains responsible for determining whether the artifact is a valid and safe image.

### Finalization and Promotion

**Choice:** Finalization derives each temporary key from trusted session data, performs R2 `HeadObject`, and compares actual content length, content type, and SHA-256 metadata with the stored target. It then uses R2 `CopyObject` to promote the object to the existing `{ledgerId}/stored/{storedFileId}` namespace without downloading bytes through Vercel. Stored-file identities and durable keys are deterministic per target so retries and concurrent finalization cannot create duplicate logical files. Temporary objects are deleted only after successful promotion and database finalization.

**Rationale:** HEAD plus server-side copy keeps image bytes out of Vercel and supports retryable finalization. Deterministic identities make partial failure recoverable instead of duplicating records.

### Content Validation

**Choice:** Planning and finalization validate declared metadata and policy limits, but do not treat client MIME or checksum as proof of image validity. The existing downstream image-processing boundary must inspect actual bytes for supported magic type, decodability, and pixel limits before AI parsing. A mismatch or unsafe image produces the existing sanitized processing failure behavior.

**Rationale:** Client-controlled metadata can establish consistency but cannot establish content trust. Full byte validation remains off the latency-sensitive Vercel upload path.

### Reads

**Choice:** Keep `/api/stored-files/{fileId}` and all other authenticated R2 read behavior unchanged.

**Rationale:** The requested optimization concerns upload traffic. Signed reads introduce independent authorization, caching, and revocation decisions.

### CORS and Bucket Privacy

**Choice:** Keep public access disabled and configure R2 CORS only for explicit production, staging, and local Web origins. Permit `PUT`, the required request headers, and the minimum response headers needed by the client. Do not use an unrestricted origin; Vercel preview deployments require an explicitly managed stable origin or do not receive direct-upload access.

**Rationale:** Browser direct PUT requires CORS, but it does not require a public bucket. Explicit origins keep the capability surface bounded.

### Temporary Object Cleanup

**Choice:** Configure an R2 lifecycle rule to delete abandoned objects under `temporary/` after a conservative interval longer than the 15-minute session TTL. Application finalization makes a best-effort delete after promotion; lifecycle deletion is the crash-safe fallback.

**Rationale:** Clients can abandon sessions and Functions can terminate between promotion steps. Provider lifecycle cleanup prevents unbounded temporary storage without putting correctness on a scheduled Vercel job.

## Design

The storage application port remains provider-neutral: callers request upload plans and finalize sessions without constructing R2 keys or importing AWS SDK types. Its R2-backed implementation gains operations to presign a PUT, inspect object metadata, copy an object within the bucket, and delete the temporary source. Direct-upload planning is the production behavior for browser and API v2 callers; API v1 continues using its current internal byte-upload path.

Plan creation validates ledger ownership, file count, supported content types, exact positive sizes, filenames, and required SHA-256 values. It creates the existing upload-session records before signing targets. Each returned target contains an absolute HTTPS R2 URL, method `PUT`, and the complete required header map. Clients must send the planned bytes and exactly those required headers.

Finalization authenticates the caller, verifies ledger ownership, the hashed finalization token, session state, expiry, unique ordered targets, and that every requested target belongs to the session. For each target it derives the temporary and durable identities from database values, verifies the R2 object using HEAD, and performs an idempotent server-side copy. Database rows are reserved and completed in retryable states so a crash between database and R2 operations can be resumed with the same session rather than generating a new stored file. The implementation must not hold a database transaction open during R2 calls.

API v2 submission finalizes the referenced upload session before invoking the existing source-document creation and queueing use case with the resulting ordered stored-file IDs. The `Idempotency-Key`, when present, covers the complete v2 source-document mutation and is namespaced by service credential. Repeating the same completed request returns the same source-document result; reusing the key for different submission content follows the repository's existing conflict behavior. Upload-session creation itself is safe to retry by creating a new session; abandoned objects are handled by lifecycle cleanup.

The signed-in browser computes checksums for prepared images, requests targets through its authenticated action, uploads targets concurrently using the returned URLs and headers, finalizes, and then continues its existing source-document submit mutation. Its user-visible prepare, plan, upload, and finalize error stages remain intact.

## Interfaces and Data Flow

`POST /api/v2/uploads` accepts authenticated JSON shaped as:

```json
{
  "files": [
    {
      "contentType": "image/jpeg",
      "byteSize": 123456,
      "sha256": "64-lowercase-hex-characters",
      "originalFilename": "receipt.jpg"
    }
  ]
}
```

It returns HTTP `201` with:

```json
{
  "uploadSessionId": "uuid",
  "expiresAt": "ISO-8601 timestamp",
  "finalizationToken": "opaque-token",
  "targets": [
    {
      "id": "uuid",
      "method": "PUT",
      "url": "https://<r2-endpoint>/<signed-target>",
      "requiredHeaders": {
        "Content-Type": "image/jpeg",
        "x-amz-meta-sha256": "64-lowercase-hex-characters"
      }
    }
  ]
}
```

`POST /api/v2/source-documents` accepts authenticated JSON shaped as:

```json
{
  "entryDate": "YYYY-MM-DD",
  "text": "optional text",
  "upload": {
    "uploadSessionId": "uuid",
    "finalizationToken": "opaque-token",
    "targetIds": ["uuid"]
  }
}
```

`upload` is omitted for text-only submissions. Inline base64 images are not part of the v2 contract. The response is HTTP `201` with the canonical `sourceDocumentId`, `revisionId`, and `revisionState`; it does not include v1's deprecated `status` compatibility field.

The browser data flow is:

```text
Browser -> authenticated Server Action: planned metadata and SHA-256
Server Action -> Postgres: create upload session and targets
Server Action -> Browser: presigned PUT targets
Browser -> private R2: image PUTs
Browser -> authenticated Server Action: finalize session
Server Action -> R2: HEAD, server-side COPY, temporary DELETE
Server Action -> Postgres: finalize stored-file identities
Browser -> existing source-document action: text, entry date, stored-file IDs
```

The API v2 data flow is identical except that service-credential routes replace the signed-in Server Actions and source-document finalization plus creation occurs within the v2 source-document request.

## Errors and Edge Cases

- Expired upload URLs or sessions fail with a sanitized conflict/expiry response; clients must request a new session.
- A missing temporary object, incorrect byte length, content type, SHA-256 metadata, target order, ownership, or finalization token prevents promotion and source-document creation.
- One failed target prevents the session from being finalized; already uploaded temporary targets remain retryable until expiry and are eventually lifecycle-deleted.
- Repeated or concurrent finalization returns the same ordered stored-file identities after completion and does not create duplicate durable files.
- A Function termination after reserving database state or copying an object is recoverable by retrying finalization with the same session and token.
- Finalization never holds a Postgres transaction or lock while awaiting R2.
- A source-document creation failure after successful upload finalization leaves finalized stored files unattached, matching the existing separation between file finalization and revision attachment; existing cleanup/reuse policy continues to apply.
- CORS preflight failure is treated as an upload-stage client error and must be covered by a staging smoke test against the deployed R2 configuration.
- Browser checksum computation failure stops before upload planning and preserves the current prepare-stage error behavior.
- API v2 rejects inline image fields rather than silently proxying them through Vercel.
- API v1 continues accepting and processing its current payloads even when R2 CORS or presigning is unavailable.

## Compatibility and Rollout

API v2 and the R2 capabilities are deployed additively before the browser switches to direct targets. Required runtime dependencies and R2 CORS/lifecycle configuration must be present in staging first. Production rollout uses a real-origin smoke test covering plan creation, CORS preflight, PUT, finalize, source-document creation, processing, and authenticated read.

The existing proxy upload Route Handler remains available during initial browser rollout as an operational rollback path, but new direct plans do not return it. Rolling back the Web deployment restores proxy target generation without changing API v1 or already durable R2 objects. API v2 must not be advertised until production smoke verification passes.

No public bucket setting is introduced. Environment and operations documentation must list allowed CORS origins, the lifecycle rule, credential scope, smoke procedure, and rollback behavior without storing secrets. Any database migration required for recoverable promotion must be additive and compatible with the previous deployment during the rollback window.

## Acceptance Criteria

- Network inspection of a browser image submission shows image PUT bodies sent to the R2 endpoint and no image body sent to a Vercel Route Handler or Server Action.
- `POST /api/v2/uploads` returns only short-lived PUT targets for server-generated temporary keys and rejects unauthenticated, unauthorized, oversized, unsupported, missing-checksum, and malformed requests.
- API v2 can create text-only and mixed text/image source documents; it rejects inline base64 images.
- API v2 preserves service-credential rate limiting and uses an `api-v2:` idempotency namespace independent from v1.
- Repeating or concurrently finalizing the same complete session yields the same ordered stored-file IDs without duplicate database rows or durable object identities.
- Finalization rejects R2 objects whose HEAD length, content type, or SHA-256 metadata differs from the upload plan.
- R2 promotion uses provider-side copy; Vercel never downloads uploaded image bytes during direct-upload finalization.
- Downstream processing rejects invalid, undecodable, unsupported, or over-pixel-limit image bytes even when their planned metadata is internally consistent.
- R2 remains private, CORS is limited to explicit origins and required PUT headers, and abandoned `temporary/` objects are covered by a lifecycle deletion rule.
- Existing authenticated stored-file reads behave unchanged.
- Existing API v1 route and integration tests pass without contract changes, and a regression test proves v1 retains its deprecated `status` response field while v2 omits it.
- The browser retains ordered multi-image submission, retry-seed ordering, text-only bypass, and prepare/plan/upload/finalize error classification.
- Targeted unit and integration tests, type checking, linting, a production build, and a staging direct-upload smoke test pass.

## Open Questions

None.
