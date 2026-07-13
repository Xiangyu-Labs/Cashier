# Managed Infrastructure Migration Remaining Work

Date: 2026-07-13
Status: Draft for user review

## Purpose

Define what remains to move Cashier from its current SQLite, local-file, and in-process task architecture to a managed
database, object storage, and background-processing architecture.

This document is a scope inventory, not a roadmap. Section order does not imply implementation order, dependency order,
priority, phase boundaries, or plan grouping. Future implementation plans may select one bounded subset at a time, but
this spec does not decide which subset comes first.

## Relationship to Existing Documents

- `2026-07-09-vercel-cloudflare-rewrite-design.md` remains the detailed reference for the intended Postgres data model,
  source-document revisions, R2 security model, transactional outbox, Queue behavior, Worker idempotency, retained
  product behavior, and processing states.
- `2026-07-11-vercel-cloudflare-migration-roadmap-design.md` is superseded for sequencing. Its historical decisions may
  explain earlier discussion, but its phase labels and order are not active requirements.
- The retired-feature and Docker-restoration plans describe work already performed. They are not part of the remaining
  migration scope.

## Current Repository State

### Completed

- Retired product features have been removed, including the task-center surface, public read APIs, export, historical AI
  categorization, category metadata generation, image crop/draw tooling, retired account mutations, and other removals
  approved in the July 9 design.
- Governance test suites have been deleted and must not be reintroduced.
- The Docker image, Docker Compose deployment, entrypoint migrations, GHCR publication, Watchtower label, and operations
  documentation have been restored.
- The current production configuration continues to support SQLite at `DATABASE_URL`, local files at
  `LOCAL_STORAGE_PATH`, Auth.js email OTP, and the existing Docker runtime.
- The current application still contains the retained source-document, ledger, category, currency, statistics,
  authentication, and service-credential product capabilities.

### Not Yet Implemented

- There is no active Neon Postgres application driver or Postgres schema in the application.
- There is no R2 storage adapter, signed upload flow, signed read flow, or R2 lifecycle configuration.
- There is no Cloudflare Worker application in the repository.
- There is no Cloudflare Queue, DLQ, outbox dispatcher, or external queue consumer.
- The parser still uses the in-process task runtime and SQLite `task_runs` persistence.
- The Web application still depends on local upload storage and a writable Docker volume.
- There is no target multi-platform release workflow or staging environment.
- Production SQLite rows and local source-document files have not been migrated.
- Vercel hosting has not been implemented and is not required by this spec.

## Required End State

The required migration is complete when Cashier can run in production with:

```text
Docker-hosted Next.js Web
Neon Postgres as the source of truth
private Cloudflare R2 source-document storage
Cloudflare Queue and DLQ for durable delivery
Cloudflare Worker for validation and background parsing
```

The required end state must preserve retained business behavior and no longer depend on SQLite, local upload storage,
or a long-running parser inside the Web container.

Vercel is outside the required end state. It may be evaluated later as a separate Web-hosting change without altering
the managed database, storage, queue, Worker, or migrated production data.

## Remaining Work: Development and Environment Isolation

- Create an isolated migration branch and worktree so migration code can be restructured without affecting the current
  production baseline on `main`.
- Establish dedicated development or staging resources for every managed provider that is selected for implementation.
- Keep migration databases, buckets, queues, Workers, credentials, domains, and test data separate from production.
- Prevent migration-branch artifacts from publishing the current GHCR `latest` image or triggering production
  Watchtower updates.
- Define ignored local secret files and non-secret example configuration without copying current production credentials.
- Record a reproducible application, test, build, and Docker baseline before infrastructure code changes.

## Remaining Work: Neon Postgres

### Schema and Migrations

- Replace SQLite-specific Drizzle tables and migrations with a Postgres-native schema and migration history.
- Define users, authentication records, workspaces, source documents, source-document revisions, stored files, revision
  files, revision entries, ledger entries, entry categories, service credentials, API idempotency records, processing
  attempts, upload sessions, processing outbox rows, and exchange-rate snapshots.
- Use Postgres numeric types for monetary values and preserve required decimal precision.
- Enforce workspace ownership with database constraints, including relationships that must not cross workspaces.
- Enforce valid active and pending revision pointers for each source document.
- Represent soft deletion, processing state, retry state, and active-result preservation explicitly.
- Create clean-database migrations and verify they can be applied without the SQLite migration history.

### Runtime Access

- Add the selected Neon-compatible Drizzle driver and connection lifecycle for the Docker Web runtime and Cloudflare
  Worker runtime.
- Replace `better-sqlite3` database construction and SQLite-specific query behavior.
- Move repository and query helpers to Postgres-compatible transactions, constraints, pagination, dates, and conflict
  handling.
- Preserve workspace authorization in the database or service layer rather than relying only on routes or UI code.
- Define one controlled migration runner. Web and Worker must not race to execute the same migration independently.

### Database Correctness

- Implement atomic source-document creation, revision creation, and related business writes.
- Implement atomic entry replacement and revision activation.
- Preserve a valid active result when a reparse attempt fails or returns an anomaly.
- Preserve service-credential hashing, revocation, authentication, and idempotency behavior.
- Preserve currency facts, exchange-rate snapshots, and recalculation atomicity.
- Validate migrations, constraints, transactions, and concurrent state changes against a real ephemeral PostgreSQL
  service.

## Remaining Work: Cloudflare R2 Storage

### Storage Boundary

- Add an R2 implementation behind a narrow storage interface instead of exposing provider SDK calls throughout business
  code.
- Store private temporary upload objects separately from immutable durable source-document files.
- Persist stored-file identifiers and trusted metadata in Neon; object paths and keys must not act as authorization.
- Keep browser and external API read models free of persistent R2 keys and bucket credentials.

### Uploads

- Implement temporary upload sessions for browser image submissions.
- Issue short-lived, PUT-only, checksum-bound R2 upload capabilities.
- Configure strict origin-specific CORS and reject wildcard production upload origins.
- Preserve text-only submission without requiring an upload session.
- Preserve multi-image and mixed text/image submission within documented limits.
- Keep the smaller external API multipart path without exposing R2 credentials or keys to API clients.

### Validation and Promotion

- Add an authenticated internal Worker endpoint that reads temporary objects and validates actual bytes.
- Validate MIME magic, decode safety, byte size, checksum, pixel dimensions, ownership, file count, and display order.
- Promote accepted objects to random immutable durable keys and create stored-file records.
- Reject finalization when uploaded objects are missing, invalid, expired, unauthorized, or inconsistent with the upload
  session.
- Configure lifecycle deletion for abandoned temporary objects.
- Define the accepted behavior for orphaned durable objects without making them readable without ownership.

### Reads and Existing Features

- Issue short-lived signed GET capabilities only after session and workspace authorization.
- Prevent signed URLs from entering persistent browser caches or external API responses.
- Adapt previews, source-document detail views, retry, edit retry, and multi-image navigation to stored-file IDs and
  expiring read URLs.
- Make all retained image-processing and parsing paths able to load evidence from R2.

## Remaining Work: Cloudflare Worker Runtime

- Create a separately deployable Worker application with explicit environment bindings and secret validation.
- Implement replay-resistant authentication for internal Web-to-Worker requests.
- Host the R2 byte-validation and promotion endpoint.
- Host Queue and DLQ consumers for source-document processing.
- Host the scheduled outbox repair dispatcher.
- Move source-document parsing, R2 evidence loading, AI calls, exchange-rate lookup, reconciliation, and result writes
  out of the Web process.
- Bound timeouts and memory use for R2 reads, image decoding, AI calls, exchange-rate calls, and database writes.
- Keep raw AI output, prompts, provider payloads, R2 keys, stack traces, and internal attempts out of normal browser
  responses.
- Define stable internal failure codes and sufficient sanitized diagnostics for operations.
- Add Worker deployment, rollback, secret rotation, and log-inspection procedures.

## Remaining Work: Cloudflare Queue, DLQ, and Transactional Outbox

### Delivery

- Provision a Queue and DLQ with explicit retry and batch settings.
- Create a small versioned queue message containing identifiers rather than hydrated business payloads.
- Insert the source document, pending revision, and outbox row in one Postgres transaction.
- Attempt immediate dispatch after commit without treating immediate enqueue as the durability boundary.
- Add a scheduled dispatcher that finds stale outbox rows and retries delivery.
- Use leases or compare-and-set updates so immediate and scheduled dispatchers do not create uncontrolled duplicate
  sends.

### Consumption

- Claim processing with a unique lease token and expiry.
- Avoid holding database transactions or row locks while reading R2 or calling external providers.
- Renew leases only at defined stage boundaries and stop finalization when lease ownership is lost.
- Finalize only when the revision is still pending, still processable, and owned by the same valid lease.
- Make duplicate delivery harmless.
- Prevent stale messages from overwriting a newer active or pending revision.
- Distinguish retryable provider or availability failures from terminal parsing outcomes.
- Handle retry exhaustion through the DLQ without overwriting newer work.
- Define queue-enqueue exhaustion and outbox re-arm behavior using stable failure codes.

### Contract Maintenance

- Keep message contracts in a shared infrastructure-neutral package used by Web and Worker.
- Version incompatible message changes and keep consumers able to drain messages already in flight.
- Document which Queue settings are infrastructure configuration and which behavior belongs in Worker code.

## Remaining Work: Web Application Adaptation

- Replace SQLite repositories and queries with the target Postgres boundaries.
- Replace local storage calls and upload routes with upload-session, R2, and signed-read boundaries.
- Replace in-process task submission and cancellation assumptions with source-document revision and outbox operations.
- Preserve current Stream, Details, Stats, Settings, manual entry, retry, edit retry, delete, category, currency,
  authentication, and service-credential behavior.
- Update browser refresh and polling behavior for external asynchronous processing without restoring a task center.
- Preserve friendly anomaly and failure states while exposing stable failure codes where useful.
- Keep the external API write-only and preserve bounded multipart ingestion, authentication, and idempotency.
- Remove obsolete SQLite, local-file, and in-process-task code only when no retained caller depends on it.
- Avoid visual redesign and unrelated component restructuring.

## Remaining Work: Docker Runtime and Multi-Platform Delivery

- Keep Docker as the required Web deployment target.
- Update the target Docker image so runtime behavior no longer requires SQLite files, a local upload directory, or an
  in-process parser.
- Decide how Postgres migrations are executed as a dedicated release action rather than by competing Web and Worker
  startups.
- Support expand/contract database changes shared by separately deployed Web and Worker versions.
- Define conditional delivery so a Web-only change does not redeploy Worker, Queue, or R2 configuration.
- Define Worker-only deployment without rebuilding the Docker Web image when no shared contract changed.
- Define explicit handling for R2 CORS/lifecycle and Queue binding/retry configuration changes.
- Add staging and production environment separation for Neon, R2, Queue, DLQ, Worker, AI, Resend, and exchange-rate
  credentials.
- Add smoke checks after database, Worker, and Web releases.
- Preserve the current production Docker deployment until the target release and data cutover are separately approved.

## Remaining Work: Operations and Observability

- Define structured logging and request or attempt correlation across Web, outbox, Queue, Worker, AI, R2, and Neon.
- Monitor outbox backlog, Queue delivery failures, DLQ depth, Worker exceptions, database failures, and processing age.
- Provide sanitized identifiers and stable error codes that allow a maintainer to diagnose a screenshot without exposing
  secrets or raw provider responses.
- Document recovery for stuck outbox rows, expired leases, queue exhaustion, Worker rollback, failed database migrations,
  and unavailable external providers.
- Document secret rotation for internal request signing, R2 credentials, Neon credentials, AI keys, and email keys.
- Define backup, retention, and restore expectations for Neon data and source-document files.
- Update the operations runbook for the multi-platform production shape while retaining Docker commands.

## Remaining Work: Verification

- Add ordinary unit tests for parser contracts, money, dates, state transitions, retry classification, and sanitization.
- Add Postgres integration tests for migrations, ownership constraints, transactions, outbox behavior, leases,
  idempotency, and concurrent finalization.
- Add storage contract tests for upload sessions, signed capabilities, file validation, lifecycle behavior, and read
  authorization.
- Add Worker and Queue tests for duplicate, delayed, stale, retryable, terminal, and exhausted messages.
- Add API contract tests for authentication, multipart limits, idempotency, and forbidden response fields.
- Add end-to-end tests for retained user workflows against fake external providers.
- Run explicit staging smoke checks against real Neon, R2, Queue, Worker, Resend, AI, and exchange-rate providers before
  production release.
- Verify retained desktop and mobile behavior where infrastructure changes affect visible workflows.
- Keep real provider calls out of default CI.
- Do not create governance, filesystem-omission, architecture-enforcement, or similar negative test suites.

## Remaining Work: Production Data Migration and Cutover

- Inventory and back up the production SQLite database and local source-document files.
- Inspect the final target schema before selecting row mappings.
- Prefer deterministic row and file mapping where data can be translated reliably.
- Use original source documents as the recovery boundary and re-import or reparse records that cannot be mapped safely.
- Make import operations idempotent and resumable.
- Preserve user and workspace ownership during import.
- Reconcile users, source documents, files, entries, amounts, currencies, categories, timestamps, and processing states.
- Define write freeze or delta capture, maintenance behavior, target deployment, domain behavior, and rollback window.
- Preserve the old Docker image, SQLite database, and local files as a read-only recovery source for an approved period.
- Declare cutover complete only after reconciliation is accepted and unresolved data loss is zero.

## Optional Work: Vercel Hosting

Vercel is not required to complete this spec. If selected later, it is a separate hosting-only project covering:

- Next.js build and runtime compatibility;
- Auth callback URLs and production domains;
- environment variables and preview environments;
- function request, response, execution, and memory limits;
- logging, monitoring, caching, PWA behavior, deployment, and rollback;
- removal of the Docker Web host only after Vercel production verification.

The optional hosting change must not redesign the database, storage, Queue, Worker, or production-data migration.

## Cross-Cutting Constraints

- Preserve business invariants and retained user workflows rather than old internal module boundaries.
- Change upper application layers only where the new infrastructure requires it.
- Keep provider SDKs behind narrow adapters.
- Keep source documents and their files as the durable recovery evidence.
- Do not expose credentials, persistent object keys, raw provider failures, prompts, or raw AI output to clients.
- Do not restore retired product capabilities.
- Do not reintroduce governance tests.
- Do not assume an atomic release across Postgres, Docker Web, Worker, and messages already in flight.
- Use backward-compatible database and message changes whenever separately deployed versions may overlap.

## Scope Completion Criteria

The required work in this spec is complete when:

- the retained Cashier product runs in production through Docker Web using Neon, R2, Queue, and Worker;
- SQLite, local uploads, and the in-process task runtime are no longer production dependencies;
- database and message changes have a documented, repeatable multi-platform release process;
- retained workflows, failure behavior, authorization, and bookkeeping invariants pass their required verification;
- production users, source documents, files, and ledger data are migrated and reconciled;
- operations, recovery, secret rotation, and rollback documentation matches the deployed system;
- Vercel remains optional and is not counted as unfinished required work.

No execution order or implementation-plan grouping is approved by this document.
