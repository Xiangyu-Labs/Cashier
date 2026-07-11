# Vercel and Cloudflare Migration Roadmap Design

Date: 2026-07-11
Status: Approved for planning

## Purpose

Move Cashier from its current Docker, SQLite, local-file, and in-process task architecture to the Vercel, Neon,
Cloudflare R2, Cloudflare Queues, and Cloudflare Worker architecture defined in
`2026-07-09-vercel-cloudflare-rewrite-design.md`.

The migration is developed on an isolated long-lived branch and worktree. The current `main` branch remains the
production baseline until the replacement has passed staging verification and a separate production-data migration and
cutover project is approved.

This roadmap covers delivery boundaries and sequencing. Each implementation phase receives its own focused spec,
implementation plan, verification, and review. There will not be one implementation plan for the whole migration.

## Relationship to the Existing Rewrite Design

The July 9 rewrite design remains authoritative for the target architecture, retained product behavior, security model,
source-document model, upload rules, queue semantics, and user-facing processing states.

This roadmap supersedes only its execution assumptions:

- The current repository is not treated as an expendable rewrite copy. `main` remains the live Docker production
  baseline.
- The migration is isolated on `codex/vercel-cloudflare-migration` in a separate worktree.
- Production data must eventually be migrated. Data migration is deferred until the target system is complete and
  verified.
- The migration branch may replace and delete legacy infrastructure as working target replacements become available,
  but retained business behavior and the existing visual experience are preserved unless an infrastructure boundary
  requires a change.
- Docker is not part of the final target architecture, but it remains untouched on `main` until final cutover.
- Governance tests remain deleted. New verification uses ordinary unit, contract, integration, end-to-end, and staging
  checks.

The retired product capabilities already removed from the repository remain retired and must not be restored as part of
the infrastructure migration.

## Goals

- Keep the current production application operational and independently maintainable throughout migration development.
- Build the target infrastructure without connecting it to current production data, storage, traffic, or credentials.
- Preserve the current business workflows and UI wherever the new infrastructure does not force a change.
- Replace SQLite with Neon Postgres and a Postgres-native Drizzle schema.
- Replace local image storage with private Cloudflare R2 storage and authorized upload/read flows.
- Replace the in-process parser runtime with Cloudflare Queues and a Cloudflare Worker.
- Deploy the Next.js application to Vercel after it no longer depends on local disk or a long-running Node process.
- Keep a reliable path for the eventual migration or replay of every production source document.
- Reach cutover through small, independently verified phases rather than a single rewrite event.

## Non-Goals

- Do not migrate production SQLite rows or local image files during the infrastructure construction phases.
- Do not dual-write production requests to the old and new systems.
- Do not send production traffic to migration-branch deployments.
- Do not redesign the product, add new business capabilities, or restore retired features.
- Do not preserve the old SQLite table layout inside the target Postgres schema solely to simplify later migration.
- Do not build permanent compatibility adapters between the old and new runtimes.
- Do not move the root Next.js application into `apps/web` solely for directory symmetry.
- Do not remove or disable the current production Docker path on `main` before the final cutover project.
- Do not reintroduce governance tests.

## Branch and Worktree Model

The repository uses two intentionally different lines of development:

```text
main
  Current production: Docker + SQLite + local files + in-process tasks

codex/vercel-cloudflare-migration
  Target system: Vercel + Neon + R2 + Queues + Worker
  Worktree: /Users/xiangyu/Projects/Cashier-vercel-cloudflare
```

Rules:

- Intermediate migration work is never merged into `main`.
- Production fixes land on `main` first and are selectively cherry-picked or merged into the migration branch when they
  still apply.
- The migration branch may restructure or delete replaced infrastructure without affecting the production worktree.
- Each migration phase should leave the migration branch buildable and testable at its documented checkpoint. Temporary
  breakage within a task is acceptable; an entire phase must not end with an unusable branch.
- Migration deployments use preview or staging resources only.
- The existing GHCR `latest` publication and Watchtower path must not receive migration-branch artifacts.
- The final merge, release workflow change, domain cutover, and Docker retirement belong to the later cutover spec.

## Isolation Boundaries

### Code

The current web application can remain at the repository root. Target-only deploy and shared-code boundaries are added
only when they have a real consumer:

```text
src/                    Next.js web application
apps/worker/            Cloudflare Worker endpoints, queue consumers, and scheduled dispatcher
packages/core/          Shared domain types and infrastructure-neutral contracts
packages/db/            Postgres Drizzle schema, migrations, clients, and transaction helpers
scripts/platform-smoke/ Explicit real-service staging verification
```

The exact layout may evolve in a phase spec, but the Worker remains a separate deploy target and business code must not
depend directly on provider SDKs.

### Cloud Resources

Migration development uses dedicated Neon, R2, Queue, DLQ, Worker, and Vercel Preview resources. Resource names,
credentials, domains, and data are separate from current production. Test resources must not be able to read or mutate
the current SQLite database or local upload directory.

### Configuration and Secrets

The repository stores schemas, migrations, deployment configuration, non-secret resource bindings, and example
environment files. Real credentials live in Vercel, Cloudflare, Neon, GitHub environment secrets, or ignored local
files. Target configuration must not be added to the current production `.env` until the cutover plan explicitly
requires it.

## Migration Roadmap

### Phase 0: Create the Isolated Development Baseline

- Create `codex/vercel-cloudflare-migration` and its separate worktree from the reviewed `main` baseline.
- Confirm the current application builds and its retained tests pass in the new worktree before migration changes.
- Establish branch, staging-resource, secret, and deployment naming conventions.
- Confirm migration-branch pushes cannot publish the current GHCR `latest` image.

Exit condition: the migration worktree is reproducible, has a recorded green baseline, and cannot affect production
deployment or data.

### Phase 1: Prove Platform Assumptions

Create bounded, disposable probes before expanding the domain implementation:

- Verify Node/Vercel and Cloudflare Worker connectivity to a test Neon database.
- Verify the selected Neon/Drizzle driver supports the required transactions, leases, and compare-and-set updates from
  both runtimes.
- Verify signed R2 uploads, checksum behavior, Worker reads, image decoding, and memory limits with non-production test
  images.
- Verify Vercel-side queue delivery, Worker consumption, retry behavior, and DLQ behavior.
- Verify replay-resistant authentication for internal Vercel-to-Worker requests.
- Record measured request-size, timeout, memory, and provider-limit results in the repository.

These probes use disposable records, objects, and messages. They do not create the business schema or connect the
current application to target services.

Exit condition: every platform assumption that could invalidate the target design has been demonstrated against real
staging services, or the target design has been revised before business implementation begins.

### Phase 2: Build the Neon and Core-Domain Foundation

- Create the Postgres-native Drizzle schema, migrations, and database package.
- Implement workspace ownership, source-document revisions, stored-file metadata, ledger entries, categories,
  credentials, processing attempts, upload sessions, outbox rows, idempotency records, and exchange-rate facts.
- Encode decimal money, composite ownership constraints, revision pointers, state transitions, and transactional
  invariants in Postgres.
- Add infrastructure-neutral contracts and transaction helpers needed by both Web and Worker.
- Test migrations, constraints, transactions, and concurrency against an ephemeral real PostgreSQL service.

This phase uses fresh test data. It does not import production rows and does not switch the current UI to Postgres.

Exit condition: a clean target database can be created from migrations and all documented database invariants pass
against PostgreSQL.

### Phase 3: Build the R2 File Foundation

- Implement private temporary and durable object namespaces.
- Implement upload sessions and short-lived signed PUT capabilities.
- Implement authenticated Worker validation and promotion of uploaded objects.
- Validate MIME magic bytes, decode safety, size, checksum, dimensions, ownership, and display order.
- Implement authorized short-lived signed reads using stored-file IDs rather than persistent object URLs.
- Configure temporary-object lifecycle cleanup.

Only upload and image-display surfaces forced by this architecture may change. The record-entry experience is not
redesigned.

Exit condition: text, image, and mixed test evidence can be stored and read through authorized staging flows without
routing normal web image bytes through Vercel.

### Phase 4: Build the Queue and Worker Processing Foundation

- Implement source-document creation, revision creation, and transactional outbox insertion.
- Implement immediate queue dispatch plus a scheduled stale-outbox repair dispatcher.
- Move parsing, exchange-rate lookup, reconciliation, and result persistence into the Worker runtime.
- Implement idempotent queue consumption, leases, compare-and-set finalization, retries, terminal failure codes, and DLQ
  handling.
- Keep raw provider output, prompts, object keys, and internal errors outside browser-facing models.

The migration branch may delete the old in-process task runtime only after the replacement processing path passes its
phase acceptance checks.

Exit condition: duplicate, delayed, stale, failed, and successful messages produce the specified revision state without
lost work or stale overwrites.

### Phase 5: Integrate the Existing Product With Vercel

- Connect the retained Next.js UI and server boundaries to Neon, R2, Queue, and Worker adapters.
- Deploy the web application to Vercel Preview or Staging.
- Preserve Stream, Details, Stats, Settings, OTP login, service credentials, manual entry, retry, edit retry, delete,
  category editing, currency behavior, and retained bilingual copy.
- Change UI contracts only where direct upload, revision state, asynchronous processing, or authorized file reads require
  it.
- Remove remaining Docker, SQLite, local-storage, and long-running-process assumptions from the migration branch after
  their target replacements are working.

Exit condition: the retained product capability matrix passes against the target architecture in staging, with no local
disk or continuously running Node server dependency.

### Phase 6: Complete Staging and Operational Verification

- Run full user-flow checks against real staging Neon, R2, Queue, Worker, Resend, AI, and exchange-rate providers.
- Verify observability, stable failure diagnostics, resource limits, retry exhaustion, and recovery procedures.
- Verify desktop and mobile retained visual behavior without performing a redesign.
- Document deployment, rollback boundaries, secret rotation, queue repair, and incident procedures.
- Keep current production traffic and data on `main` throughout this phase.

Exit condition: the target system runs independently under production-like staging conditions and has no unresolved
release-blocking capability or operational gaps.

### Phase 7: Migrate Production Data and Cut Over

This is a separate future design and implementation project. It starts only after Phase 6 is approved.

- Inventory and back up the production SQLite database and local source-document files.
- Prefer deterministic mapping into the target schema when old data can be translated reliably.
- Use original source documents as the recovery boundary and re-import or reparse records that cannot be mapped safely.
- Reconcile user ownership, document counts, entry counts, amounts, currencies, source files, and processing outcomes.
- Define the write-freeze or delta-capture method, maintenance window, domain switch, release workflow switch, and
  rollback window.
- Preserve the old Docker deployment and data as a read-only recovery source for the approved retention period.

The requirement is eventual complete migration, not byte-for-byte preservation of the old table layout. No migration
script or mapping is selected by this roadmap.

Exit condition: reconciliation is accepted, traffic uses the target system, and the documented rollback window closes
without unresolved data loss.

### Phase 8: Resume Business Evolution

New product features, deeper UI changes, and nonessential refactors resume only after the target production system is
stable. They are not bundled into infrastructure migration work.

## Data-Migration Readiness Without Early Data Migration

Production data migration is deferred, but the target architecture must not make it impossible:

- Source documents and their files remain the durable evidence from which ledger results can be reconstructed.
- Target creation boundaries must support deterministic idempotency so a later importer can retry safely.
- Target records must retain enough source identity and timestamps for reconciliation without inheriting the old schema.
- File ownership and revision relationships must be explicit rather than inferred from object paths.
- The later migration project may combine direct row mapping and source-document replay; neither strategy is implemented
  during Phases 0 through 6.

## Business-Surface Change Policy

A migration phase may change an upper-layer boundary only when required by the target infrastructure. Expected examples
include upload-session APIs, signed file reads, source-document revision states, polling behavior, and stable processing
failure codes.

The following do not justify upper-layer changes during this roadmap:

- directory cleanup for its own sake;
- visual redesign;
- renaming user-facing concepts to match provider terminology;
- adding platform controls to the normal product UI;
- restoring retired task management, export, batch operations, account mutations, or historical AI categorization.

## Verification Strategy

- Preserve or rewrite retained behavior tests as boundaries change; do not preserve tests that only encode obsolete
  architecture.
- Use ordinary unit tests for domain rules and parser contracts.
- Use contract tests for Web, Worker, and external API boundaries.
- Use a real ephemeral PostgreSQL service for database migrations, constraints, transactions, and concurrency.
- Mock external hosting and providers in default CI; default CI must not require real Neon, R2, Queue, Resend, AI, or
  exchange-rate calls.
- Use explicit staging smoke scripts for real-service verification.
- Use end-to-end and visual checks when the retained product is connected to the target infrastructure.
- Do not create filesystem, omission, architecture, or other governance suites.

Each phase defines its own acceptance commands and evidence. A passing build alone is not sufficient for platform,
database, queue, or release gates.

## Failure and Rollback Boundaries

- Failures in migration-branch code or staging services cannot mutate current production data.
- There is no old/new production dual write during construction, so there is no cross-system consistency process before
  cutover.
- A failed phase remains on the migration branch and does not change the production runtime.
- The migration branch removes a legacy subsystem only after its target replacement is verified within that branch.
- Production rollback mechanics begin only in the Phase 7 cutover design. Until then, `main` and its production data are
  the unaffected fallback.

## Planning Boundary

This overview is intentionally too broad for a single implementation plan. After user approval, the first
implementation plan covers only Phase 0 and Phase 1:

1. Create the migration branch and worktree.
2. Record the green baseline and production-isolation checks.
3. Establish only the repository boundaries needed by the platform probes.
4. Run and document the bounded Neon, R2, Queue, Worker, and Vercel staging validations.

Phase 2 receives a new database-foundation spec and plan after the platform assumptions are verified.
