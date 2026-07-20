# Performance Validation Baseline Specification

## Problem

Cashier needs evidence before broad performance optimization. The application spans browser, Vercel application runtime, Neon Postgres, and private Cloudflare R2, but the repository currently has no single automated harness that records which workflows load which client assets, which server operations are duplicated or serial, and which conclusions are valid locally versus only in a production-like deployment.

Without this harness, implementation can optimize the wrong boundary, compare incomparable timings, or treat mocked local storage/database behavior as proof of real cloud latency. The result needed is not a synthetic maximum-throughput benchmark. It is a repeatable baseline report that identifies high-confidence structural bottlenecks and clearly separates them from hypotheses requiring Preview measurement.

## Goals

- Create a test-only, repeatable performance validation harness for common Cashier workflows.
- Produce a versioned Markdown baseline report with commands, environment, evidence, limitations, and prioritized optimization candidates.
- Measure production-build client chunk membership and gzip sizes for the locale shell, authenticated page, default stream tab, and deferred feature boundaries.
- Prove structural server behavior with deterministic tests: duplicate same-request reads, serial versus parallel independent work, hydration duplication, and dormant feature loading.
- Exercise a small browser workflow smoke suite under a local development server with the existing development-auth bypass, while labeling its timings as relative local observations only.
- Verify current upload/read route behavior using existing test doubles and route tests without contacting a real R2 bucket.
- Preserve all production behavior, deployment topology, security boundaries, and user data. The harness may add test scripts, test-only dependencies, fixtures, and reports only.
- Give a later optimization specification enough evidence to choose a small, prioritized set of improvements.

## Non-Goals

- Change application production code to optimize performance during this work.
- Claim Vercel, Neon, R2, or public-network latency from local tests or mocks.
- Add distributed tracing, real-user monitoring, a new telemetry provider, Redis, a queue, or a new storage-transfer architecture.
- Require browser performance timing to be a flaky CI pass/fail gate.
- Benchmark raw database throughput, R2 bandwidth, or AI-provider latency in the local test environment.
- Upload files to a real R2 bucket, use production credentials, or access production user data.
- Replace existing unit, integration, or build checks.

## Background

The repository already has Vitest unit and integration projects, an isolated local Postgres test database, seeded test users, route/integration coverage for uploads and stored files, and `next build --webpack`. It has no Playwright configuration and no performance-report directory. Development authentication can create a local user and ledger when `DEV_AUTH_BYPASS=true` under `next dev`; it is intentionally disabled in production.

The previous analysis measured a clean production build's default ledger client graph at approximately 290 KB gzip for the unique locale-provider, authenticated page, and default stream chunks, excluding the Next.js framework runtime. It also identified repeated `auth()` call sites, page-level async work outside an effective Suspense boundary, whole-catalog translation delivery, a shared constants-to-runtime-environment import path, and dynamic feature hosts that may load inactive dependencies. These are candidates, not conclusions about real cloud latency.

The global performance specification requires workflow-oriented evidence. This validation specification is the evidence-gathering prerequisite and is intentionally independent from the later production optimization implementation.

## Decisions

### Test Scope

**Choice:** Cover the common workflows through static build analysis, deterministic server/integration tests, and a limited local browser smoke suite: login, home route, default stream, tab intent/navigation, filtering/pagination, opening record entry/detail/settings, upload-session creation, stored-file reads, and logout where the existing local auth fixture supports it.

**Rationale:** These flows cover the primary browser/application/database/R2 boundaries without creating an exhaustive end-to-end suite for every API edge case.

### Test Layers

**Choice:** Use three layers: static production-build analysis, deterministic Vitest structural tests, and optional Playwright local browser smoke tests.

**Rationale:** Static analysis gives repeatable client evidence; Vitest gives stable server and contract evidence; browser smoke tests confirm the visible workflow and request order. No one layer can establish all facts.

### Cloud-Latency Boundary

**Choice:** Local measurements are reported as local relative observations only. The report must list Vercel/Neon/R2 latency as unmeasured until a separately authorized Preview run uses real deployed services.

**Rationale:** This prevents false confidence from local Docker Postgres, mocked R2, or a loopback browser server.

### Browser Environment

**Choice:** Add Playwright as a test-only development dependency and run browser smoke tests against `next dev` with `DEV_AUTH_BYPASS=true`, isolated test database configuration, and no production credentials. Browser timing is informational, not a CI budget gate.

**Rationale:** The existing dev-auth route provides a safe authenticated local path. A production server cannot enable that bypass, so this suite validates workflow shape and obvious request waterfalls rather than production Web Vitals.

### Build Measurement

**Choice:** Build with the repository's `next build --webpack`, parse Next build manifests rather than hard-coded chunk names, sum unique gzip sizes, and retain the raw file lists used for every metric.

**Rationale:** Content hashes change on every build. Manifest-driven analysis stays valid as chunk names and splitting change.

### Structural Server Evidence

**Choice:** Use controllable promises, spies, and existing application adapters to test call counts and start order. Tests must assert behavior such as request-scoped deduplication or parallel initiation, not wall-clock millisecond limits.

**Rationale:** Timing assertions are unstable in CI. Ordering and invocation counts directly detect the request waterfalls the future optimization should remove.

### R2 Evidence

**Choice:** Reuse existing route/integration test doubles for upload and stored-file workflows. Record authorization, metadata lookup, response streaming/body behavior, size/error paths, and number of application calls; do not test real R2 latency.

**Rationale:** The repository can prove the application contract locally while real object-storage timing remains an external deployment measurement.

### Report Format

**Choice:** Generate one checked-in Markdown report under `docs/formless/reports/` and one machine-readable JSON artifact under an ignored generated-results directory. The Markdown report is the authoritative handoff artifact.

**Rationale:** JSON supports repeatable comparison, while Markdown lets the next spec author evaluate evidence, limitations, and priorities without replaying every command.

### Candidate Classification

**Choice:** Classify every finding as `confirmed-structural`, `confirmed-build`, `local-observation`, `external-validation-needed`, or `not-observed`. Rank only confirmed findings and low-risk follow-ups; do not rank unmeasured cloud-latency claims as facts.

**Rationale:** The later optimization spec must distinguish proof from hypothesis.

## Design

The test harness has one command that prepares prerequisites, runs the selected layers in a fixed order, collects artifacts, and writes a report. Individual layer commands remain available for local diagnosis and CI targeting. A failed required layer produces a report section marked failed with command output summary; it does not silently omit the result. Optional browser execution may be skipped only when the report states why, such as missing Playwright browser binaries or unavailable test database.

The static layer performs a clean production webpack build and reads the server client-reference manifest, React loadable manifest, build manifest, and emitted chunk files. It computes gzip and raw sizes from unique JavaScript files. It records: locale provider graph; authenticated ledger-page shell; default stream tab; each inactive tab; record-entry forms; modal renderer; settings/drag-and-drop; and any chunk containing known server-environment validation markers. It records membership, size, and whether a module is initial, intent-preloaded, or action-loaded according to the current manifest and source import boundary. The analyzer must not depend on a hash, current absolute path, or stale `.next` output.

The deterministic test layer adds focused tests around current high-risk boundaries. It creates test-local delayed operations and spies at the existing dependency seams to record when work begins. The suite records current behavior rather than forcing future optimized behavior to pass. For example, it may demonstrate duplicate authentication calls or that an outer page await prevents fallback streaming, then preserve those observations in the report. Tests must be isolated, use the existing test database lifecycle, and avoid global timing thresholds.

The browser layer starts a local `next dev` server with an explicitly allocated port, `DEV_AUTH_BYPASS=true`, test database connection, and test-only runtime values. It logs in through the visible development-auth path, visits the localized home route, exercises the default stream and one representative action in each deferred feature category, and records navigation/request URLs, resource types, transfer sizes when exposed, and screenshots/traces on failure. It may measure elapsed wall time for comparison within one run, but the report labels this timing local and non-production. It must close the server, browser, context, and database handles even on failure.

The upload/read checks reuse existing integration routes and storage doubles. The harness reports which R2-facing operation was exercised, whether an application authorization check occurred, whether the response body was handled as a stream-compatible response, and which error paths passed. It reports no storage bandwidth or geographic latency claim.

The report contains: repository commit; Node and package versions; command lines; environment classification without secrets; layer status; client bundle table; browser workflow result table; deterministic structural findings; R2 contract findings; limitations; external Preview checklist; and a prioritized candidate table. Each candidate names affected workflow, evidence class, evidence location, probable boundary, expected user impact, implementation complexity, risk, and recommended next action. The report must include a statement that it does not measure real Vercel, Neon, R2, or user-network latency.

## Interfaces and Data Flow

The test command interface is:

- `npm run test:performance:build` - produce the production-build manifest metrics and JSON artifact.
- `npm run test:performance:structural` - run deterministic Vitest performance-boundary tests.
- `npm run test:performance:browser` - run optional Playwright local workflow smoke tests.
- `npm run report:performance` - run all supported layers and write the Markdown and JSON baseline artifacts.

Exact script names may be adjusted only if they follow existing package-script conventions and are documented in the final report.

The generated JSON contains a schema version, run metadata, layer status, metrics, findings, limitations, and candidate classifications. It contains no credentials, tokens, signed URLs, user/ledger IDs, document content, raw query parameters, or file bytes.

The Markdown report is named `docs/formless/reports/YYYY-MM-DD-performance-validation-baseline.md`. It links to the generated JSON by relative path, lists the exact commit, and identifies whether it is a fresh run or an update. Generated timing JSON, Playwright output, screenshots, traces, and temporary result files are ignored by Git unless a failure artifact is deliberately selected for documentation.

## Errors and Edge Cases

- If `next build --webpack` fails, the report marks build analysis failed and includes the concise failure reason; it must not reuse a stale `.next` manifest.
- If the local Postgres test database is unavailable, structural/database-dependent and browser layers are marked blocked, with setup instructions and no fabricated result.
- If Playwright browser binaries are absent, the browser layer is marked skipped with the installation command; build and structural layers still run.
- If development authentication is unavailable, the browser layer stops rather than bypassing authentication through an unsafe production-only mechanism.
- If a resource is served from cache, the report distinguishes cache reuse from a missing request only when the browser exposes that information; otherwise it labels the state unknown.
- If a dynamic import is not represented unambiguously in manifests, the report marks membership as inconclusive and cites the source import boundary rather than guessing.
- Tests with deliberate delayed promises must always release those promises in cleanup to prevent hanging Vitest workers.
- Browser tests must use a unique port and clean up spawned processes so they do not interfere with an existing developer server.
- The harness must not read or print `.env` values beyond whether required test configuration is present.
- A local browser duration regression is reported as an observation, not a failed performance gate, unless a future spec explicitly sets a stable budget.
- R2 route tests must not make a network call to a real bucket even when local environment credentials exist.

## Compatibility and Rollout

The harness is test-only. Production application source behavior, schema, API contracts, PWA configuration, Vercel settings, Neon settings, and R2 configuration remain unchanged. New dependencies are development-only and run only through explicit package scripts.

The baseline report is created after the harness passes locally. CI integration is initially limited to build manifest analysis and deterministic structural tests. Playwright local workflow tests remain an opt-in or scheduled job until their environment setup is proven stable. A later Preview validation specification may reuse the report schema and candidate table, but it must not claim local results as cloud measurements.

## Acceptance Criteria

- The repository has documented, runnable commands for build, structural, browser, and aggregate performance reporting.
- A clean build analysis parses current manifests and emitted chunks without hard-coded content hashes or stale build output.
- The build artifact reports unique raw and gzip sizes for the locale providers, authenticated page shell, default stream tab, inactive tabs, entry forms, modal renderer, settings/drag-and-drop, and known environment-validation markers.
- The build artifact records the current default-stream baseline under the defined measurement scope and lists every contributing chunk.
- Deterministic tests record current call counts and start order for selected authentication, ledger/bootstrap, and hydration boundaries without using fragile elapsed-time assertions.
- Deterministic tests exercise upload-session and stored-file route behavior through existing local doubles and record only contract evidence, not real R2 latency.
- The browser suite uses a local development server, existing dev-auth bypass, and the isolated test database; it never uses production credentials or production data.
- Browser tests cover login, home/stream, tab intent/navigation, one filter or pagination action, one deferred feature opening action, upload-session creation, stored-file route access, and logout when supported by the local fixture.
- Browser timing output is clearly labeled local, relative, and non-production.
- The aggregate command writes a Markdown report and machine-readable JSON result with command outcomes, environment classification, metrics, findings, limitations, and candidate table.
- The report explicitly states that real Vercel, Neon, R2, and public-network latency were not measured and lists the required Preview validations.
- Every candidate is classified using the selected evidence taxonomy; unmeasured cloud-latency hypotheses are not presented as confirmed findings.
- Generated browser and JSON artifacts are ignored by Git, while the Markdown baseline report is available for review.
- Existing unit/integration tests, linting, type checking, and production build remain passing after test-harness additions.

## Open Questions

None.
