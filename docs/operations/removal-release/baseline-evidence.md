# Removal Release Baseline Evidence

Updated: 2026-07-13

This evidence package covers only OpenSpec tasks 1.1 through 2.8 for
`prepare-production-ready-application-layer`. It does not authorize production deployment and it
does not begin task 3.1.

## Implementation identity

| Field                     | Recorded value                                             | Status                       |
| ------------------------- | ---------------------------------------------------------- | ---------------------------- |
| Base commit               | `c223d539b673ce7c7f926e026aba6baf97b69733`                 | Accepted implementation base |
| Branch                    | `codex/prepare-production-ready-application-layer-removal` | Isolated branch              |
| Production image          | `ghcr.io/xiangyu-labs/cashier`                             | Existing Docker target       |
| Currently deployed digest | Not available from this workstation                        | Blocking production evidence |
| Production approval       | Not granted                                                | Hard stop                    |

The production owner must record the immutable digest from the production host before approval:

```bash
docker inspect --format '{{.Image}}' cashier
docker image inspect --format '{{index .RepoDigests 0}}' "$(docker inspect --format '{{.Image}}' cashier)"
```

## Snapshot inventory

The local `data/sqlite.db` was inspected read-only and rejected as a production snapshot. It has an
empty schema (zero applied migrations and zero business tables), while `data/uploads` contains 498
files totaling 22,790 bytes. Treating those unrelated inputs as an accepted production snapshot
would create false migration totals.

Run the aggregate-only inventory against an owner-approved coordinated snapshot:

```bash
npm run ops:inventory -- \
  --database file:/secure/snapshot/sqlite.db \
  --uploads /secure/snapshot/uploads \
  > /secure/evidence/production-inventory.json
```

The command opens SQLite with `readonly` and `query_only`, prints no source text, task payload,
credential, image URL, storage key, file name, or filesystem path, and reports:

- SQLite integrity, foreign-key violations, user version, and applied Drizzle migration totals;
- counts for every application table;
- aggregate source-document status/type/deletion/anomaly totals;
- aggregate task states and active retired-task totals;
- total/local/remote/malformed/missing image-reference counts;
- local regular-file count/bytes plus symlink and non-file anomalies.

Accepted production totals remain pending until the production owner identifies and approves the
snapshot. Any non-zero integrity failure, foreign-key violation, missing local reference, active
retired task, malformed image data, symlink, or unsupported filesystem entry is a stop condition.

## Automated baseline

| Gate              | Result  | Observation                                                        |
| ----------------- | ------- | ------------------------------------------------------------------ |
| ESLint            | Pass    | 17.40 seconds                                                      |
| TypeScript        | Pass    | 4.72 seconds                                                       |
| Unit tests        | Pass    | 140 files, 785 tests, 20.25 seconds                                |
| Integration tests | Pass    | 59 files, 309 tests, 17.85 seconds                                 |
| Coverage          | Pass    | lines 61.34%, statements 60.46%, functions 54.77%, branches 53.85% |
| i18n catalogs     | Pass    | 2 locales                                                          |
| Next.js build     | Pass    | compiled in 8.4 seconds; total 17.09 seconds                       |
| Docker build      | Not run | Docker CLI is not installed on this workstation                    |

The final repository `npm run check` also passed after removal cleanup and test-storage isolation:
199 coverage test files, 1,094 coverage tests, the same coverage percentages, Next.js compilation in
7.3 seconds, and catalog validation, with a total wall time of 108.24 seconds. The local upload
inventory remained exactly 498 files and 22,790 bytes before and after the final suite.

Next.js emitted only the retained application routes: localized application/authentication pages,
authenticated uploads, and `POST /api/v1/source-documents`. The build emitted no public API v1
read route or task-center route.

Request count, polling activity, response size, and desktop/mobile interaction observations are
recorded after the local browser rehearsal. Production latency and production response-size
acceptance remain separate approval evidence.

## Migration baseline

The repository contains 35 SQL migration files, `0000` through `0034`. The removal release adds no
target-model schema. `0034_retire_category_ai_tasks.sql` is a data-only cleanup that cancels pending
or running retired AI-category tasks and preserves completed history and parse tasks. Its missing
Drizzle journal entry was repaired during removal preparation so the ordinary entrypoint migration
path actually applies the existing SQL file.

No Neon, R2, Cloudflare Queue/Worker, or Vercel dependency is connected by this release.

## API v1 client inventory

No in-repository browser or server caller invokes `/api/v1`; repository usage is limited to the
route and behavior tests. The published response is `{sourceDocumentId, status}` and contains no
task ID, task progress field, local image URL, storage key, or provider detail.

Known external clients cannot be inferred from the repository. The production approval owner must
attest to the client list and confirm that every client uses only authenticated
`POST /api/v1/source-documents`. Unknown client reliance is a deployment stop condition.

## Open production blockers

- Name the production approval owner and maintenance-window operator.
- Record the currently deployed immutable image digest.
- Identify and approve a coordinated production snapshot.
- Record accepted inventory totals and resolve all anomalies.
- Run the coordinated backup and Docker restore rehearsal on a Docker-capable host.
- Record external API v1 clients.
- Complete the Docker build and exact-digest rollback rehearsal.
- Grant explicit production approval before executing any deployment command.
