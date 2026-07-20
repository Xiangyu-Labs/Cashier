# Global Performance Optimization Specification

## Problem

Cashier is a client-facing Next.js application whose requests cross several independently deployed systems: the browser, the Vercel application runtime, Neon Postgres, and Cloudflare R2. Each boundary can add network latency, transfer cost, connection setup time, and failure modes. The current optimization work identifies some first-render inefficiencies, but the product needs a coherent approach that also covers common post-load workflows: authentication, navigation, filtering, pagination, record creation, uploads, file reads, details, statistics, settings, and logout.

The risk is not that every layer is inherently slow. The risk is compounded latency from avoidable serial operations, redundant authorization and reads, unnecessary transfer through the application runtime, oversized client or RSC payloads, and client work that is unrelated to the current user task. Optimizing isolated components without considering the complete request path can move delay from one layer to another without improving the user experience.

The application must improve these paths without turning a focused product into an over-engineered distributed system. Existing Vercel, Neon, R2, Next.js, React Query, and module boundaries remain the default architecture.

## Goals

- Establish an end-to-end performance model for the browser, Vercel runtime, Neon Postgres, and R2 boundaries across common user workflows.
- Measure and prioritize the user-visible cost of navigation, data loading, mutation, upload, download, and rendering paths rather than optimizing by assumption alone.
- Remove high-value request waterfalls, duplicate work, avoidable application-to-database or application-to-R2 round trips, and unnecessary data transfer.
- Keep data reads and mutations correct, authorized, observable, and resilient when a downstream service is slow or unavailable.
- Improve initial render as one important workflow while also improving subsequent navigation, tabs, filtering, pagination, details, statistics, settings, uploads, and stored-file access.
- Reuse the existing React Query cache, HTTP caching for static assets, connection reuse, direct structured database reads, and lazy feature loading where they have a clear benefit.
- Implement a small number of low-risk, well-understood theoretical optimizations when their cost is low and their behavior is easy to verify, even if direct production timing evidence is not yet available.
- Preserve a clear codebase and avoid adding infrastructure or complexity whose operating cost exceeds its likely benefit.
- Produce measurable before-and-after evidence for implemented performance work wherever feasible.

## Non-Goals

- Introduce Redis, a new managed cache, a message queue, a background worker, a cron-driven processing system, or a service mesh solely for performance.
- Replace Vercel, Neon, R2, Next.js, React Query, or Postgres as part of this work.
- Default to R2 presigned URLs, public buckets, browser CORS changes, or a new direct-upload architecture before measurement demonstrates that the current authenticated proxy path is the limiting factor.
- Cache authenticated HTML, RSC responses, API responses, or user-specific data in the service worker.
- Change existing product semantics, authorization requirements, URL formats, query keys, upload contracts, or manual processing-recovery behavior merely to improve a benchmark.
- Perform broad rewrites of stable modules for hypothetical micro-optimizations.
- Treat local synthetic timings as a substitute for preview or production-like measurements.
- Require every small optimization to have production telemetry before it may be implemented; low-risk, localized, standard improvements remain allowed.

## Background

The browser reaches Vercel over the public network. Vercel server rendering, route handlers, server actions, and background `after()` callbacks then access Neon Postgres and Cloudflare R2 over separate network paths. The client also reaches Vercel for navigations, actions, uploads, and authenticated stored-file reads. A user operation can therefore accumulate latency at several points even when no individual query or asset is unusually expensive.

The current authenticated home route has repeated `auth()` call sites, sequential ledger resolution and access validation, and a page-level bootstrap that waits before its `Suspense` fallback can render. The shared locale layout currently supplies all translation namespaces, globally mounts client providers that some routes do not need, and imports server runtime environment validation through a shared constants module. The default stream view includes non-essential motion and dynamically reachable feature code in its client graph.

Uploads and stored-file reads use authenticated application route handlers that proxy access to private R2. This is a deliberate security model and remains the default. Neon is accessed through the application's Postgres layer. Existing React Query hydration, query keys, stale times, mutation invalidation, PWA installability, and no-runtime-data-cache policy are established application behavior.

The existing `initial-render-performance` specification defines the first-render specialization. This specification incorporates it into a broader workflow-oriented program without replacing its detailed acceptance criteria.

## Decisions

### Scope

**Choice:** Cover all common user-facing workflows: login, authenticated home, tab navigation, filtering, pagination, record and source-document details, statistics, record entry, uploads, stored-file reads, settings, category ordering, and logout. Rank work by user frequency and demonstrated impact.

**Rationale:** Users experience total workflow time, not only the first page response. Limiting scope to the initial render would leave repeated high-latency interactions unexamined.

### Existing Deployment Architecture

**Choice:** Retain Vercel for the application, Neon Postgres for data, and private Cloudflare R2 accessed through authenticated application routes. Evaluate and document regional placement and runtime configuration, but do not redesign the transfer architecture by default.

**Rationale:** The current architecture is appropriate for the product. The first responsibility is to reduce avoidable work and network hops within it, then use measured evidence before considering a new storage-transfer model.

### Optimization Selection Rule

**Choice:** Implement work that either has measured meaningful impact or is a low-risk, localized, standard optimization with clear expected benefit and simple verification. Do not implement all theoretically possible optimizations.

**Rationale:** Measurements prevent wasteful complexity. A narrow allowance for established improvements, such as removing duplicate reads or using direct imports, prevents obvious low-cost work from being blocked by missing telemetry.

### Cache Policy

**Choice:** Use existing React Query client caching, HTTP caching for immutable static assets, request-scoped server deduplication, database connection reuse, and narrowly scoped safe result reuse. Do not introduce Redis or cross-request caching of authorization-sensitive responses.

**Rationale:** These mechanisms cover the current needs with minimal operational cost. Request-scoped reuse lowers duplicate work without delaying authorization changes across requests.

### Latency-Aware Request Design

**Choice:** Prefer a single authorized context, parallel independent I/O, compact projections, pagination, and one structured query over repeated cross-service round trips. Preserve sequential work only where data dependencies require it.

**Rationale:** Network boundaries amplify every avoidable request. Fewer round trips are more reliable than attempting to compensate with aggressive caching.

### R2 Path Policy

**Choice:** Keep authenticated R2 proxy uploads and reads. Optimize client preprocessing, metadata lookup, streaming, size limits, timeout behavior, and transfer observability first. Consider direct R2 transfer only after measurements identify the proxy as the primary bottleneck and a separate approved design addresses authorization and CORS.

**Rationale:** The proxy preserves access control and avoids adding browser-to-storage security complexity. It should not be replaced merely because it introduces an additional hop.

### Database Path Policy

**Choice:** Use Neon pooled connections with conservative per-runtime pool limits, inspect real query plans and timings, and optimize high-frequency or high-latency queries through indexes, projections, batching, and query consolidation. Do not change schema or add denormalized caches without a measured query problem.

**Rationale:** Database network latency and query execution must be distinguished. Pooling, indexes, and compact reads solve common problems while preserving relational correctness and maintainability.

### Client Delivery Policy

**Choice:** Deliver the shell and current task first. Defer inactive tabs, unopened dialogs, detail viewers, settings-only drag-and-drop, non-essential motion, and translations owned by unloaded features. Preserve fast intent-driven preloads for likely next actions.

**Rationale:** A smaller initial graph improves both first render and responsiveness on constrained networks without taking features away from users.

### Reliability Under Latency

**Choice:** Every user-facing downstream operation has an explicit timeout, cancellation, retry, idempotency, or error-boundary behavior appropriate to its side effect. Reads may be retried safely where existing semantics permit; writes and uploads must not be blindly duplicated.

**Rationale:** Slow networks and independently deployed services cause partial failure. A faster average request is not sufficient if slow or failed requests produce duplicate data or an unusable interface.

### Observability

**Choice:** Add structured timing and outcome telemetry at workflow boundaries, not per-line tracing. Record server duration components for request handling, database work, R2 work, serialization, and relevant downstream errors; correlate them with a request identifier that is safe to expose in logs and client error reports.

**Rationale:** The team needs enough evidence to identify which boundary is slow without adopting a costly distributed-tracing platform or logging sensitive payloads.

### Measurement and Budgets

**Choice:** Define baseline and target metrics per workflow. Use production-like preview measurements for end-to-end timing, automated tests for structural guarantees, and bundle analysis for client payload. Keep the existing initial-render budget and add workflow budgets only after baseline collection.

**Rationale:** Not every workflow has the same acceptable latency or data volume. Measured baselines allow the program to focus on regressions and the slowest meaningful paths.

## Design

Performance work is organized by user workflow and traced through its actual boundaries:

1. Browser work: route transition, JavaScript parse and execution, rendering, image preparation, request initiation, interaction feedback, and client cache use.
2. Application work: middleware/proxy handling, authentication, RSC/server rendering, route handlers, server actions, serialization, and response streaming.
3. Database work: connection acquisition, authorization context use, query count, query planning, execution time, result cardinality, and transaction duration.
4. Object-storage work: metadata authorization, upload/download byte count, client-side preprocessing, stream duration, R2 request duration, and failure handling.

For every selected workflow, the system records a concise timing envelope: browser-to-first-response, Vercel server duration, number and duration of database operations, number and duration of R2 operations when applicable, response payload size, client JavaScript required before interaction, and end-to-end completion time. Telemetry records identifiers and classifications, not ledger contents, credentials, file bytes, prompts, or other sensitive data.

The initial-render work follows the dedicated specification: route-level fallback, request-scoped authentication and ledger context, parallel active-tab bootstrap, narrow hydration, provider scoping, client/server configuration separation, feature-aligned translations, and deferred interaction-only code. It remains the first implementation candidate because it establishes patterns reused by other workflows.

Subsequent tab navigation uses the existing URL and React Query contracts. The active tab renders immediately from cached hydrated data when available; otherwise, it shows a stable tab-local pending state while its fetch begins. Pointer and keyboard intent may preload an inactive tab's code and non-sensitive data only when the user signals intent. No timer loads every inactive feature merely because the page is open.

Filtering and pagination preserve current URL state and query keys. Filter input changes are locally responsive; expensive list or statistic recomputation is debounced or transitioned only when user intent and existing UX allow it. Server reads use narrow filters, stable page limits, and compact projections. Repeated client-side transformations over large collections are replaced with a single derived pass or server-side aggregation when measurement identifies the transformation as material.

Details, settings, record-entry forms, modal implementations, chart code, drag-and-drop code, and their translation bundles remain feature boundaries. They load on explicit activation and display existing skeleton or pending states while loading. Detail or edit commands should prewarm their code and data on pointer/focus intent only when the action is likely and cheap.

Database access begins with one request-scoped authenticated and authorized context. Independent reads use `Promise.all`; dependent operations start their independent prerequisites early and await them only at the point of use. High-value database queries are measured with execution duration and query plans before changes. Optimizations use existing repository/application boundaries, parameterized SQL, indexes justified by observed predicates/sorts, batch reads for known ID sets, and projections that exclude unused columns. Each database mutation remains transactional only for invariants that must commit together.

R2 upload and read paths retain application authorization. Before transfer, the browser compresses and normalizes images within existing policy limits and reports progress without blocking unrelated UI. The application validates metadata before opening an R2 stream, avoids buffering whole objects when streaming is available, propagates cancellation, and distinguishes client disconnects, validation errors, authorization failures, storage failures, and size/time limits. Metadata and object reads must not form unnecessary database-R2-database waterfalls. Any future direct transfer proposal is explicitly out of scope until telemetry demonstrates that Vercel proxy transfer dominates the workflow and a separate specification approves security changes.

The application uses HTTP caching only for immutable static assets and framework artifacts. React Query remains the client-side data cache, with stale times and invalidation tuned from actual volatility. Request-scoped React caching deduplicates session, current-user, ledger-context, and other repeated server reads within one render. Cross-request caches may be considered only for public, immutable, non-user-specific data after a separate decision; they are not introduced here.

Timeout and retry behavior is explicit. Navigation and read requests are abortable when the user changes intent. Retryable reads use bounded retries with user-visible pending and error states. Mutations, upload session creation, and finalization use idempotency or existing unique constraints so retries cannot duplicate records. Upload retries resume only where the existing upload contract can safely do so; otherwise the UI presents a clear retry action.

Deployment review records the Vercel runtime region, Neon region and pooled endpoint, R2 bucket region, and user population region. The goal is to identify obvious geographic mismatch and configuration errors, not to mandate a migration. Recommendations are made only when expected round-trip reduction is material for measured traffic.

## Interfaces and Data Flow

The performance observation interface produces a structured, privacy-safe workflow record with:

- workflow name and operation class;
- request/correlation identifier;
- route or server-action identifier;
- status class and error category;
- server duration, database operation count and duration, and R2 operation count and duration when applicable;
- response or transfer byte bucket, not raw content;
- retry, cancellation, cache-hit, and fallback indicators.

Browser telemetry may attach the same correlation identifier to client errors and user-perceived navigation/interaction measurements. It must not attach session tokens, user identifiers, ledger identifiers, query values, document content, image data, or signed URLs.

The existing request contracts remain stable:

- Browser-to-application routes, server actions, and URL search parameters retain their current shapes.
- React Query keys and invalidation contracts remain stable while hydration and request timing may change.
- The application continues to authorize R2 reads and upload targets before storage access.
- Postgres repositories continue to receive authorized ledger/user scope rather than unrestricted client identifiers.
- Upload progress, error, retry, and cancellation states become explicit UI state where they are not already represented.

The workflow selection interface records, for each candidate optimization, its measured baseline when available, expected gain, complexity, risk, affected contract, verification method, and whether the rationale is empirical or low-risk theoretical. Candidates without material evidence or low-risk rationale are deferred.

## Errors and Edge Cases

- A slow or unavailable Neon connection must surface a bounded, localized error and must not leave the client waiting indefinitely.
- A user navigation that supersedes an in-flight read aborts or ignores the stale response without showing previous data under the new route or filter.
- Session/user and ledger-context request caching must not persist authorization across requests or allow access after an account/ledger has changed.
- Concurrent default-ledger creation retains the existing conflict-safe result.
- A query optimization must preserve empty, paginated, filtered, uncategorized, and large-result semantics.
- Database retries must not replay non-idempotent mutations or partially committed transactions.
- R2 reads and uploads distinguish application authorization failure from storage failure, browser cancellation, size validation failure, and timeout.
- Client disconnect during an R2 transfer must cancel or release upstream work where supported and must not be logged as a successful transfer.
- Upload progress and retry controls remain accessible with keyboard and assistive technology.
- Deferred feature code or message loading must provide an accessible pending state and recoverable error state.
- Reduced-motion settings remain honored when initial-view motion is replaced or deferred.
- Static asset caching must not cache authenticated responses or stale user data.
- Observability failures must fail open: missing telemetry cannot block authentication, reads, mutations, uploads, or downloads.
- Region recommendations must not expose provider credentials, internal endpoint details, or user location data.

## Compatibility and Rollout

The optimization program does not require a database migration, new cache service, service-worker data cache, or public R2 bucket. Existing routes, server actions, query keys, PWA behavior, and authorization boundaries remain compatible.

Work rolls out in small workflow-oriented changes. Each change first records a baseline where feasible, then lands behind existing error boundaries and feature behavior, validates functional compatibility, and compares the same seeded account, dataset, deployment region, browser profile, and throttling conditions before and after. The initial-render work is validated first because it supplies reusable patterns for request scoping, streaming, bundle analysis, and measurement.

Low-risk theoretical optimizations may ship without a measured baseline only when they are localized, preserve contracts, have a clear industry-standard rationale, and include focused tests or build inspection. Examples include direct imports replacing known barrel imports, moving server-only configuration behind a server boundary, removing duplicate same-request calls, or avoiding dormant dynamic component mounts. They must be recorded as theoretical and revisited after measurement.

Changes that suggest a new infrastructure service, a direct browser-to-R2 path, cross-request user-data caching, broad schema changes, or a product-visible UX tradeoff require a separate specification and explicit approval. They are not silently introduced during implementation.

## Acceptance Criteria

- A workflow inventory identifies the common flows in scope, their browser/application/database/R2 boundaries, owner modules, baseline status, and priority.
- Each implemented optimization has a recorded reason, expected gain, complexity, risk, affected contract, and verification method; it is classified as measured or low-risk theoretical.
- No optimization is implemented solely because it is theoretically possible when it has high complexity, uncertain behavior, or no clear user/workflow relevance.
- The initial-render implementation satisfies the dedicated initial-render specification, including its streaming, authentication, hydration, client-bundle, and Web Vitals criteria.
- Request-scoped authentication, user, and ledger context eliminate repeated same-request reads without introducing cross-request authorization caching.
- Common navigation, tab switching, filtering, pagination, details, statistics, settings, record entry, upload, stored-file read, and logout flows have explicit pending, success, cancellation, and error behavior appropriate to their operation type.
- Independent database and R2-adjacent operations in selected workflows execute in parallel; remaining sequential operations have documented data dependencies.
- High-frequency or high-latency database queries selected for change have before/after query count, duration, and plan evidence, and preserve existing result semantics.
- The application uses Neon pooled connections with conservative runtime pool limits and does not create a new pool per request.
- R2 uploads and reads retain authenticated authorization, stream where supported, avoid unnecessary whole-object buffering, surface accessible progress/errors, and do not add a direct-transfer architecture without separate approval.
- The application does not add Redis, a queue, a worker, public R2 access, service-worker runtime data caching, or cross-request caching of authenticated data.
- Immutable static assets retain appropriate HTTP caching while authenticated HTML, RSC, API, and user data are not cached by the service worker.
- Initial and deferred client feature boundaries are verified by production build inspection; inactive tabs, closed dialogs, detail implementations, settings drag-and-drop, and non-essential motion are absent from the default initial graph.
- Initial route and feature-specific translation payloads contain only namespaces required for the rendered shell and active feature, without missing-key flashes on later activation.
- Structured timing telemetry identifies application, database, and R2 time for selected workflows without recording sensitive identifiers or payload content; telemetry failure does not affect user operations.
- Preview measurements for selected workflows use the same region, seeded account, representative data volume, mobile/browser profile, and throttling before/after; at least three runs are recorded and compared by median.
- Deployment review documents Vercel, Neon, R2, and primary-user regional placement and issues recommendations only for material measured or strongly evidenced latency mismatches.
- Focused unit/integration/UI tests, linting, type checking, and production builds pass for each implemented workflow change.

## Open Questions

None.
