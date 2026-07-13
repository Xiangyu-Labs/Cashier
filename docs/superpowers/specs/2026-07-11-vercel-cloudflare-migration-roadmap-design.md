# Managed Infrastructure Migration Roadmap Design

Date: 2026-07-11
Updated: 2026-07-13
Status: Draft for revised user review

## Purpose

Migrate Cashier's infrastructure one subsystem at a time while keeping the current Docker-hosted Next.js application
as the web runtime through production data migration and cutover.

The required infrastructure sequence is:

```text
Neon
  -> R2 plus a minimal validation Worker
  -> Cloudflare Queue plus the parsing Worker
  -> production staging and data migration while Web remains on Docker
  -> optional Vercel hosting migration after the new production system is stable
```

Each major migration receives its own spec, implementation plan, execution, verification, and review. Neon, R2,
Queue/Worker, and Vercel must not be combined into one implementation plan.

## Relationship to the Existing Rewrite Design

`2026-07-09-vercel-cloudflare-rewrite-design.md` remains authoritative for the target Postgres data model, R2 security
model, source-document revisions, transactional outbox, Queue semantics, Worker idempotency, retained product behavior,
and user-facing processing states.

This roadmap supersedes these parts of the earlier design:

- Vercel is no longer required before the production data migration or first target-system cutover.
- Docker remains the production Web host through the Neon, R2, Queue/Worker, staging, and data-migration phases.
- Vercel becomes a separate optional hosting decision after the managed backend has run stably in production.
- The migration is incremental. There is no destructive reset that introduces all target providers at once.
- Production data must eventually be migrated, but no production-data migration occurs during Phases A through D.
- Governance tests remain deleted. Verification uses ordinary unit, contract, integration, end-to-end, and explicit
  staging checks.

The product capabilities already retired from the repository remain retired and must not be restored during
infrastructure migration.

## Goals

- Reduce migration pressure by introducing one main infrastructure dependency at a time.
- Keep the current `main` Docker production application unaffected while migration work proceeds on an isolated branch
  and worktree.
- Keep the migration branch runnable at the end of every phase.
- Preserve existing business workflows and visual behavior except where a new infrastructure boundary requires a
  change.
- Replace SQLite with Neon before changing storage or background processing.
- Replace local image storage with R2 while retaining the current in-process parser temporarily.
- Replace the in-process parser with Cloudflare Queue and Worker only after Neon and R2 are working.
- Complete production data migration and cutover without also changing the Web hosting platform.
- Make Vercel an independent later decision rather than a hidden prerequisite.
- Keep database and message contracts maintainable across separately deployed Web and Worker runtimes.

## Non-Goals

- Do not provision or validate every target provider in one phase.
- Do not create a single implementation plan covering Neon, R2, Queue/Worker, and Vercel.
- Do not migrate production SQLite rows or local image files during Phases A through D.
- Do not dual-write production requests to the current and target systems.
- Do not send production traffic to migration-branch staging resources.
- Do not redesign the product, add new business capabilities, or restore retired features.
- Do not preserve the SQLite table layout in Postgres solely to simplify later migration.
- Do not make Vercel a condition for production data migration or target-system cutover.
- Do not remove the Docker deployment from `main` before the separately approved cutover.
- Do not reintroduce governance tests.

## Branch and Worktree Model

```text
main
  Current production: Docker + SQLite + local files + in-process tasks

codex/vercel-cloudflare-migration
  Incremental target: Docker Web + managed backend services
  Worktree: /Users/xiangyu/Projects/Cashier-vercel-cloudflare
```

Rules:

- Intermediate migration work is not merged into `main`.
- Production fixes land on `main` first and are selectively synchronized into the migration branch when applicable.
- The migration branch may replace and delete a legacy subsystem only after that phase's replacement passes its
  acceptance checks.
- Each completed phase leaves the migration branch buildable, testable, and runnable with its current combination of
  old and new infrastructure.
- Migration resources use dedicated development or staging credentials and contain no production data.
- Migration-branch artifacts must not publish the current GHCR `latest` tag or trigger the current production
  Watchtower deployment.
- Final merge, production release workflow changes, data cutover, and rollback belong to a later cutover spec.

## Incremental Runtime States

The migration branch deliberately passes through these supported intermediate architectures:

```text
Current baseline
  Docker Web + SQLite + local files + in-process tasks

After Phase A
  Docker Web + Neon + local files + in-process tasks

After Phase B
  Docker Web + Neon + R2 + in-process tasks

After Phase C
  Docker Web + Neon + R2 + Queue/Worker

After production cutover
  Docker Web + Neon + R2 + Queue/Worker + migrated production data

Optional later state
  Vercel Web + Neon + R2 + Queue/Worker
```

An intermediate state is not accepted merely because its code compiles. The retained application workflows must run
against that phase's architecture before the next subsystem migration begins.

## Repository Boundaries

The current Next.js application remains at the repository root. New boundaries are added only when their phase needs
them:

```text
src/                    Docker-hosted Next.js application
packages/core/          Infrastructure-neutral shared contracts
packages/db/            Neon Postgres schema, migrations, clients, and transactions
apps/worker/            Introduced in Phase B for R2 validation, extended in Phase C for Queue processing
scripts/staging-smoke/  Per-phase real-service verification scripts
```

The Web application does not move to `apps/web` merely for directory symmetry. Provider SDK usage stays behind narrow
database, storage, queue, and Worker adapters.

## Phase A: Neon Migration

Phase A is the first independent migration project. Its implementation plan also creates the isolated branch and
worktree before changing application code.

### Scope

- Record a green build, test, and Docker baseline in the migration worktree.
- Provision only a dedicated development/staging Neon project and database.
- Create the Postgres-native Drizzle schema and migrations.
- Implement workspace ownership, users, source documents and revisions, ledger entries, categories, credentials,
  processing state, exchange-rate facts, and the database relationships required by retained behavior.
- Adapt the current Web application and in-process task runtime to use Neon.
- Keep local image files and the current storage adapter.
- Keep the current in-process parsing runtime.
- Keep Docker as the Web runtime.
- Verify migrations, constraints, transactions, retained workflows, and Docker startup against Neon test data.

### Explicitly Deferred

- R2 buckets, R2 credentials, signed uploads, and signed reads.
- Cloudflare Worker code or deployment.
- Cloudflare Queue and DLQ resources.
- Vercel project creation or deployment.
- Production data migration.

### Exit Condition

The migration-branch application runs through Docker using Neon as its only database while continuing to use local image
storage and the in-process parser. The Neon schema can be recreated from migrations, and retained database behavior
passes against real PostgreSQL.

Phase A has one dedicated Neon migration spec and one dedicated Neon implementation plan.

## Phase B: R2 Migration and Minimal Validation Worker

Phase B begins only after Phase A is accepted.

### Scope

- Provision a dedicated staging R2 bucket.
- Introduce `apps/worker` with only the authenticated HTTP endpoints required to inspect and promote uploaded objects.
- Implement temporary upload sessions, short-lived signed PUT uploads, strict CORS, checksums, and per-file limits.
- Validate actual bytes, MIME magic, decode safety, dimensions, checksum, ownership, and display order in the Worker.
- Promote accepted objects to immutable durable keys and persist stored-file metadata in Neon.
- Implement authorized short-lived signed reads using stored-file IDs.
- Configure temporary-object lifecycle cleanup.
- Adapt the existing in-process parser to read source images from R2 through the storage boundary.
- Keep Docker as the Web runtime and keep parsing inside the current Node process.

### Explicitly Deferred

- Cloudflare Queue, DLQ, queue consumers, and outbox dispatch.
- Moving AI parsing or exchange-rate work into the Worker.
- Vercel deployment.
- Production file migration.

### Exit Condition

The Docker-hosted migration application uses Neon and R2 for all test data and files while the current in-process parser
continues to work. Upload, validation, promotion, authorized read, retry, and image-processing flows pass against staging
R2.

Phase B has one dedicated R2 migration spec and one dedicated R2 implementation plan.

## Phase C: Queue and Parsing Worker Migration

Phase C begins only after Phase B is accepted. Queue and the parsing Worker are one project because a Queue without a
consumer does not replace any application capability.

### Scope

- Provision a dedicated Queue and DLQ.
- Extend the Phase B Worker with Queue, DLQ, and scheduled-dispatch handlers.
- Add source-document revision creation and transactional outbox insertion in Neon.
- Implement immediate dispatch plus scheduled repair of stale outbox rows.
- Move AI parsing, R2 reads, reconciliation, exchange-rate lookup, and result persistence into the Worker.
- Implement idempotent consumption, leases, compare-and-set finalization, retry classification, terminal failure codes,
  duplicate protection, stale-message protection, and DLQ handling.
- Remove the old in-process task runtime from the migration branch only after the replacement passes acceptance checks.
- Keep Docker as the Web runtime.

### Stable Queue Contract

Queue messages carry identifiers, not complete business payloads. The default contract is intentionally small:

```json
{
  "version": 1,
  "revisionId": "..."
}
```

The Worker loads current facts from Neon using `revisionId`. Database column additions therefore do not normally require
a Queue contract change. A future message-version change must preserve consumption of messages already in flight.

### Explicitly Deferred

- Vercel deployment.
- Production data migration.
- Unrelated business or visual changes.

### Exit Condition

The Docker-hosted migration application uses Neon, R2, Queue, and Worker. Successful, duplicate, delayed, stale,
retryable, terminal, and exhausted messages produce the specified source-document state without lost work or stale
overwrites.

Phase C has one dedicated Queue/Worker migration spec and one dedicated Queue/Worker implementation plan.

## Phase D: Docker-Based Staging and Operational Verification

Phase D validates the complete managed backend while deliberately retaining Docker Web hosting.

- Run retained user workflows against real staging Neon, R2, Queue, Worker, Resend, AI, and exchange-rate providers.
- Verify login, upload, parsing, retry, edit retry, manual entry, delete, stats, failure recovery, and file authorization.
- Verify desktop and mobile retained visual behavior without redesigning the product.
- Add operational visibility for Web, Worker, Queue retries, DLQ, database migrations, and stable failure diagnostics.
- Document release ordering, secret rotation, queue repair, Worker rollback, and database recovery.
- Confirm the Docker Web runtime has no dependency on SQLite, local uploads, or a long-running parser.

Exit condition: the Docker-hosted target architecture is independently production-ready with test data. Current
production data and traffic remain on the old `main` deployment.

Phase D receives its own staging and operations spec and plan.

## Phase E: Production Data Migration and Cutover

Phase E is a separate project and begins only after Phase D is accepted.

- Inventory and back up production SQLite data and local source-document files.
- Prefer deterministic row and file mapping where old data can be translated reliably.
- Use original source documents as the recovery boundary and re-import or reparse records that cannot be mapped safely.
- Reconcile users, source documents, entries, amounts, currencies, categories, files, and processing outcomes.
- Define write freeze or delta capture, maintenance window, release sequencing, domain behavior, and rollback window.
- Deploy the target application as Docker Web with Neon, R2, Queue, and Worker.
- Preserve the old Docker image, SQLite database, and local files as a read-only recovery source for the approved period.

This phase changes data and backend infrastructure, but it does not change Web hosting from Docker to Vercel.

Exit condition: production traffic uses Docker Web with the managed backend, reconciliation is accepted, and the
documented rollback window closes without unresolved data loss.

Phase E receives its own data-migration and cutover spec and plan.

## Phase F: Optional Vercel Hosting Migration

Vercel is evaluated only after the Phase E production system has run stably for an agreed period. Phase F may be
deferred indefinitely or rejected without invalidating Phases A through E.

If selected, Phase F covers only the Web hosting change:

- Vercel build and runtime compatibility.
- Auth callback URLs, domains, environment variables, preview environments, logs, and observability.
- Function limits, request limits, caching, PWA behavior, and release rollback.
- Removal of the final Docker Web hosting dependency after Vercel production verification.

Neon, R2, Queue, Worker, business schema, production data, and processing behavior remain unchanged during this phase.

Phase F receives its own hosting-migration spec and plan only after a separate user decision.

## Operational Release Model

The managed backend creates more deploy units than the current single Docker image. The design reduces, but does not
pretend to eliminate, that coordination cost.

### Typical Changes

| Change | Required Release Action |
| --- | --- |
| Web-only business or UI code | Build and publish the Docker Web image |
| Additive database schema change | Run one Drizzle migration, then deploy affected Web or Worker code |
| Worker-only parsing change | Deploy the Worker; Queue and Web remain unchanged |
| R2 read/write behavior | Deploy only the Web or Worker component containing that adapter |
| R2 CORS or lifecycle policy | Apply the Cloudflare configuration change |
| Queue retry, DLQ, or binding settings | Apply Worker/Queue configuration and deploy the Worker |
| Queue message contract | Deploy backward-compatible consumer support before the producer emits the new version |

Queue itself is not regularly redeployed application code. Most Queue-related changes are Worker code or infrequent
binding and retry-policy changes.

### Database Migration Ordering

Postgres migrations are executed once by a dedicated release step. Web and Worker do not independently race to apply
migrations on startup.

Changes shared by Web and Worker use expand/contract deployment:

1. Apply an additive migration that remains compatible with current Web and Worker versions.
2. Deploy the Worker version that can handle the old and new representation.
3. Deploy the Docker Web version that starts using the new representation.
4. Allow old Queue messages and old code paths to drain.
5. Remove obsolete columns or compatibility code in a later release.

This is more operationally complex than a single Docker artifact, but it avoids requiring an atomic deployment across
Postgres, Web, Worker, and messages already in flight.

### Release Automation

The later production release workflow should expose explicit, ordered jobs rather than silently deploying every
platform on every commit:

```text
database migration, when present
  -> Worker deployment, when changed
  -> Docker Web image publication, when changed
  -> smoke verification
```

R2 and Queue infrastructure configuration runs only when its tracked configuration changes. A routine Web change does
not redeploy Worker, Queue, or R2.

## Data-Migration Readiness Without Early Data Migration

- Source documents and files remain the durable evidence from which ledger results can be reconstructed.
- Target creation boundaries support deterministic idempotency so a later importer can retry safely.
- Target records retain enough source identity and timestamps for reconciliation without inheriting the SQLite schema.
- File ownership and revision relationships are explicit rather than inferred from object paths.
- Phase E may combine direct row mapping and source-document replay; neither strategy is implemented in Phases A through
  D.

## Business-Surface Change Policy

An upper-layer boundary changes only when the current phase requires it. Expected forced changes include Postgres query
semantics, upload-session APIs, signed file reads, source-document revision states, polling behavior, and stable
processing failure codes.

The following do not justify upper-layer changes:

- visual redesign;
- unrelated directory cleanup;
- provider terminology in user-facing copy;
- platform controls in the normal product UI;
- restoring retired task management, export, batch operations, account mutations, or historical AI categorization.

## Verification Strategy

- Each migration phase has its own focused test and staging matrix.
- Phase A real-service verification uses Neon only.
- Phase B real-service verification adds R2 and the minimal validation Worker only.
- Phase C real-service verification adds Queue, DLQ, and the parsing Worker only.
- Default CI mocks hosted providers and does not require real production or staging credentials.
- Database integration tests use a real ephemeral PostgreSQL service.
- Retained business behavior is tested at every accepted intermediate runtime state.
- No filesystem, omission, architecture, or other governance suites are added.

## Failure and Rollback Boundaries

- A failed migration phase remains on the migration branch and cannot mutate current production data.
- There is no old/new production dual write during Phases A through D.
- A legacy subsystem remains available in the migration branch until that phase's replacement is verified.
- Production rollback mechanics are designed in Phase E. Until then, `main` and its data remain the unaffected fallback.
- Vercel failure or deferral after Phase E does not require a database, storage, queue, Worker, or data rollback because
  Docker remains a supported Web host.

## Planning Boundary

The previous combined Phase 0/1 platform-validation plan is obsolete because it provisions and validates Neon, R2,
Queue, Worker, and Vercel in one implementation plan. It must not be executed.

After this revised roadmap is approved:

1. Write only the Phase A Neon migration spec.
2. After user approval, write only the Phase A Neon implementation plan. Worktree creation is the first task in that
   plan.
3. Execute and verify Phase A before designing Phase B in implementation detail.
4. Give Phase B its own R2 spec and plan.
5. Execute and verify Phase B before designing Phase C in implementation detail.
6. Give Phase C its own Queue/Worker spec and plan.

No Phase B, Phase C, or Vercel implementation tasks belong in the Phase A plan.
