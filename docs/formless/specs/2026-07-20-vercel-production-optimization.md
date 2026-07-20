# Vercel Production Optimization Specification

## Problem

The application has completed its Neon and Cloudflare R2 data migration, but several runtime assumptions still target a single long-lived server. Before production deployment to Vercel, OTP rate limiting must work across function instances, database connection usage must fit Neon pooling, and the initial ledger experience must avoid downloading code for inactive workflows. Historical one-time migration tooling also remains in the production repository.

## Goals

- Enforce OTP send, resend, and verification limits consistently across Vercel instances using Postgres.
- Bound each Vercel function instance to a small Neon connection pool.
- Keep the initial ledger experience focused on the active tab and defer unopened input workflows.
- Remove the Lucide dynamic icon lookup that includes the full icon registry in a client chunk.
- Remove completed SQLite-to-Neon and local-storage-to-R2 migration tooling while retaining ongoing schema migrations.
- Remove Vercel-irrelevant or ineffective Next image configuration.

## Non-Goals

- Add a background worker, cron queue drain, or automated AI-processing retry system.
- Change the existing user-visible processing failure and manual retry experience.
- Make the R2 bucket public.
- Delete the ongoing `db:migrate` schema migration command.
- Delete historical migration evidence or runbooks; they remain records but must not advertise retired executable commands as current operations.
- Implement i18n namespace-level client message splitting in this change.
- Introduce R2 presigned URLs or change the current authenticated R2 proxy path.

## Background

Source-document processing is currently triggered with request-scoped `after()` callbacks. The product deliberately accepts that a failed or interrupted processing task is surfaced to the user for manual retry, so no worker replacement is required.

The API v1 surface already uses `rate_limit_buckets` with atomic Postgres increments, while OTP controls use process-local memory. The latter is not shared between Vercel instances. The PostgreSQL client currently permits ten connections per runtime instance, which can multiply during serverless scale-out.

The ledger shell uses dynamic imports for tabs, but a post-load timer preloads every tab. The source-document input and quick-entry form are also imported by the initial client bundle despite being rendered only in a closed dialog. Category icons use `lucide-react`'s dynamic icon registry, preventing narrow client-side icon imports.

R2 is private and currently accessed through authenticated Vercel route handlers. The application will retain that model for this release; direct R2 access would require browser CORS configuration and server-issued presigned URLs, but is explicitly deferred.

## Decisions

### AI Processing Reliability

**Choice:** Keep request-scoped processing with user-visible failures and manual retry.

**Rationale:** The product explicitly does not want a worker-based retry system. This optimization must not alter the current recovery contract.

### OTP Rate Limit Store

**Choice:** Keep `src/modules/auth/services/otp-rate-limit.ts` and replace its in-memory implementation with the existing Postgres rate-limit infrastructure.

**Rationale:** The module remains an active auth boundary. Reusing `rate_limit_buckets` provides cross-instance consistency without introducing Redis or another managed dependency.

### R2 Transfer Path

**Choice:** Retain the existing authenticated Vercel proxy for R2 uploads and reads. Do not configure CORS or introduce presigned URLs in this release.

**Rationale:** This keeps the current security and application flow unchanged. The known Vercel request/response size, bandwidth, and function-resource constraints are accepted until a future dedicated storage-transfer change.

### Neon Connection Pool

**Choice:** Require Neon’s pooled runtime connection string and lower the per-instance `pg` pool maximum to two connections.

**Rationale:** Vercel scales instances independently. A small local pool avoids multiplying direct database connections while Neon provides aggregate pooling.

### Initial Ledger Loading

**Choice:** Preserve dynamic tab imports, remove timer-driven all-tab preloading, preload an inactive tab only on pointer/focus intent, and dynamically load record-entry forms only when the dialog is opened.

**Rationale:** This retains responsive navigation for likely next actions without making every inactive workflow part of the first-load cost.

### Client Icon Loading

**Choice:** Replace the dynamic Lucide icon registry lookup with a static map containing the supported category icons and legacy fallbacks.

**Rationale:** Static imports allow bundling only the icons the application actually supports.

### Retired Migration Tooling

**Choice:** Delete one-time SQLite-to-Neon, local-file-to-R2, migration rehearsal, coordinated backup, and inventory scripts; remove their npm commands and tests/types that only exist for those scripts. Retain `db:migrate`.

**Rationale:** The infrastructure migration has completed. Ongoing schema migrations are still a production requirement.

### Next Configuration

**Choice:** Remove `output: "standalone"` and image optimizer settings that have no effect while `images.unoptimized` is enabled. Keep the PWA as an installable shell with no runtime data caching.

**Rationale:** Vercel does not need standalone output, and the retained image configuration should accurately reflect the private, upload-normalized image model.

## Design

The OTP module becomes a thin domain wrapper around the Postgres limiter. It derives namespaced bucket keys for email, IP, resend cooldown, and OTP verification. Counter increments remain atomic. Cooldowns store their activation time in the existing bucket table and are read as remaining seconds. Database failures continue to fail open, with structured error logging, matching the current availability-oriented auth behavior.

The initial ledger bundle loads only the active tab. Inactive tab imports are initiated on pointer enter or keyboard focus. The AI and quick-entry forms are dynamic components rendered only while the record dialog is open. The existing server bootstrap retains its conditionally parallel React Query prefetching.

## Interfaces and Data Flow

R2 upload and download contracts are unchanged: authenticated browser requests are handled by Vercel route handlers, which authorize access and proxy object bytes to or from the private bucket.

The Postgres rate-limit interface exposes atomic increment results and cooldown activation/remaining-time reads. OTP callers preserve their current return contracts: allowed state, remaining attempts, and retry time where applicable.

## Errors and Edge Cases

- R2 errors remain user-visible as upload/read failures; no public bucket fallback is allowed.
- The existing proxy path remains subject to Vercel function request/response size, memory, duration, and bandwidth limits; this release does not expand those limits.
- Postgres rate-limit failures log the failure and preserve the existing fail-open behavior.
- A missing or unsupported category icon must render the existing text fallback instead of throwing.
- The manual retry path remains available when an `after()` processing attempt does not finish.

## Compatibility and Rollout

Deploy the Postgres limiter only after verifying `rate_limit_buckets` exists in Neon through the normal schema migration history. Use preview deployments to verify Vercel environment variables, Neon pooled URL, private R2 proxy uploads and reads within the selected Vercel plan's limits, OTP limits, and production build output.

Historical migration documents remain in place as records. Their retired commands must be clearly identified as historical if documentation is updated in the implementation.

## Acceptance Criteria

- OTP limits are shared across separate Vercel function instances through Postgres and the active module path remains `src/modules/auth/services/otp-rate-limit.ts`.
- Runtime database connections use a Neon pooled URL and no function instance configures more than two `pg` connections.
- R2 remains private and all upload/read authorization continues through the existing Vercel route handlers.
- An inactive ledger tab is not preloaded solely because the page has been open for 500ms, but pointer/focus intent can preload it.
- Record-entry form code is absent from the initial ledger client path until the record dialog opens.
- Production bundle analysis no longer includes the full dynamic Lucide registry for category icons.
- Retired migration scripts, their npm commands, and script-only tests/types are absent; `npm run db:migrate` remains available.
- Type checking, linting, targeted rate-limit/UI tests, and a production build pass.

## Open Questions

None.
