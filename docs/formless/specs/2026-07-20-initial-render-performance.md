# Initial Render Performance Specification

## Problem

The authenticated ledger home page delays its first useful response until authentication, ledger resolution, ledger access validation, and every active-tab bootstrap query have completed. Although the page contains `Suspense` fallbacks, the expensive bootstrap work is awaited before the boundary is returned, so the current skeleton cannot stream while that work is pending.

The same request can evaluate the session in the protected layout, the page, and ledger access checks. Each session evaluation can read the user record from Postgres. The request then resolves the user's single ledger and reads the owned ledger again before starting the active-tab queries. This creates avoidable duplicated work and a serial server critical path.

The current production build also sends a large client graph for the shared locale providers, ledger page shell, and default stream tab. The measured unique application chunks are approximately 936 KB raw and 290 KB gzip, excluding the Next.js framework runtime. The graph includes globally scoped session state, full locale catalogs, server environment validation code, Zod reached through that environment code, Framer Motion, date and drag-and-drop dependencies, and feature code that is not required until a modal, settings control, or other interaction is opened.

## Goals

- Stream a stable authenticated application shell and tab skeleton before active-tab data queries finish.
- Deduplicate authentication and current-user resolution within a request while preserving database-backed user validity checks.
- Resolve or create the single user ledger once per request and reuse the resulting authorized ledger context.
- Keep active-tab server queries parallel where independent and prevent non-critical work from delaying the first shell response.
- Reduce the measured initial application JavaScript for the default stream view from approximately 290 KB gzip to no more than 220 KB gzip, excluding the Next.js framework runtime.
- Keep server-only environment configuration and validation code out of all client chunks.
- Load only core and active-feature translations, providers, animations, dialogs, forms, and interaction libraries on the initial route.
- Preserve URLs, authentication behavior, ledger behavior, query keys, mutations, accessibility, PWA installability, and the existing manual processing-recovery contract.
- Meet an authenticated mobile performance target of LCP at or below 2.5 seconds, INP at or below 200 milliseconds, and CLS at or below 0.1 in the agreed preview test environment.

## Non-Goals

- Change ledger, source-document, category, currency, or authentication product behavior.
- Move initial ledger data fetching entirely to the browser.
- Put mutable authorization state into a cross-request cache.
- Remove database validation of the session user or accept delayed account revocation semantics.
- Add Redis, a new cache service, a background worker, a queue, a cron job, or automatic AI-processing retries.
- Add runtime caching for authenticated HTML, RSC payloads, API responses, or user data in the service worker.
- Redesign the visual language, navigation model, tabs, filters, dialogs, or settings workflows.
- Optimize unrelated API routes, ingestion throughput, database schema, or infrastructure costs except where they are directly on the initial-render path.
- Guarantee production Web Vitals solely from local synthetic tests; production network, region, and database placement remain external factors.

## Background

The locale layout currently loads both application fonts, obtains the complete locale message catalog, and mounts `NextIntlClientProvider`, `SessionProvider`, `QueryClientProvider`, the theme provider, and the toaster for every localized page. Only the settings feature reads the client session, but the session provider is global. Client-visible constants import the complete runtime environment facade, which imports startup validation and Zod.

The protected layout authenticates the request. The home page authenticates it again, resolves the user's single ledger, and calls a bootstrap query. The bootstrap query performs another authenticated ledger access check and then waits for a `Promise.all` containing categories and the queries for the selected tab. For the default stream tab, the response waits for attention items, counts, the first completed page with included ledger entries, and summary statistics. Recovery scheduling already uses `after()` and is not intended to block the response.

The ledger client dynamically declares tab components, record-entry forms, and the modal renderer. However, rendering a dynamic host while its feature is closed can still initiate its module graph, and barrel imports widen shared async chunks. The default stream graph includes Framer Motion for list layout, card presence, pull-to-refresh, and toolbar animation. Date and drag-and-drop code also occur in large shared chunks. The current route supplies all 34 translation namespaces even though the default stream view uses only a subset.

This specification extends the completed Vercel production optimization work. It does not replace or rewrite `docs/formless/specs/2026-07-20-vercel-production-optimization.md`.

## Decisions

### Optimization Scope

**Choice:** Optimize the authenticated ledger home page and the shared locale layout used to reach it, including server rendering, authentication, data bootstrap, providers, translations, fonts, client bundle boundaries, and the default stream view.

**Rationale:** The shared layout and providers contribute directly to the ledger route's first load. Restricting work to `LedgerPageClient` would leave major server and client costs unchanged.

### Rendering Strategy

**Choice:** Preserve server rendering and React Query hydration, but return a route-level fallback immediately and place active-tab bootstrap work inside an actual asynchronous `Suspense` subtree.

**Rationale:** This retains SEO-independent server rendering, avoids a client-fetch waterfall, and allows users to see a stable shell while database queries continue.

### Authentication Consistency

**Choice:** Use request-scoped React caching for the authenticated session and current database user. Do not use cross-request caching for authorization decisions.

**Rationale:** Request-scoped caching removes duplicate session and user reads without delaying account deletion, disablement, or other authorization changes across requests.

### Ledger Context

**Choice:** Resolve, create when necessary, authorize, and materialize the user's single ledger through one request-scoped server operation whose result is reused by the shell and bootstrap queries.

**Rationale:** The current list-ID and owned-ledger reads are sequential and partially duplicate the later access check. A single authorized context avoids redundant work while preserving the one-ledger invariant and default-ledger creation behavior.

### Active Data Bootstrap

**Choice:** Split shell-critical data from active-tab data. Prefetch only the selected tab's data, preserve parallel execution for independent queries, and dehydrate query state at the narrowest subtree that consumes it.

**Rationale:** A single page-wide bootstrap makes the slowest active-tab query gate the entire response. Narrow hydration boundaries permit progressive output without introducing duplicate browser requests.

### Client Provider Scope

**Choice:** Keep React Query, theme, and notification support at the smallest shared client boundary that requires them. Remove the global session provider and provide the settings feature with a minimal authenticated account DTO from the server.

**Rationale:** Only settings reads the client session. Global session state adds code and can initiate a session request for routes that already have a validated server session.

### Server and Client Configuration Boundary

**Choice:** Separate environment-independent client constants from server-only runtime configuration. Server environment access and startup validation must be protected by a server-only boundary.

**Rationale:** Importing `runtimeEnv` from a shared constants module pulls environment field definitions, validation logic, and Zod into client chunks and weakens the intended server boundary.

### Feature Code Loading

**Choice:** Use direct, statically analyzable imports for dynamic feature boundaries. Inactive tabs preload only on pointer or keyboard intent. Record-entry forms, modal implementations, detail viewers, drag-and-drop controls, and settings-only code load only when the related feature is activated.

**Rationale:** Intent-driven loading keeps likely next actions responsive without paying for closed or inactive workflows during initial render. Direct imports prevent barrel modules from widening async chunks.

### Initial Animation Budget

**Choice:** Remove Framer Motion from the initial shell and default stream rendering path. Use CSS transitions or native browser behavior for simple initial-view feedback. Motion may remain in asynchronously loaded detail or editing features when it provides meaningful interaction value.

**Rationale:** The current default stream view pulls a large shared motion chunk for effects that do not justify blocking or inflating the first interactive view.

### Translation Loading

**Choice:** Provide core shell and active-tab message namespaces on initial render. Load inactive-tab, settings, record-entry, detail-modal, and error-workflow namespaces with their feature boundaries.

**Rationale:** Supplying all 34 namespaces serializes messages that cannot be used on the initial stream view. Feature-aligned message bundles reduce RSC payload and keep dynamic features self-contained.

### Font Loading

**Choice:** Keep the primary sans-serif font self-hosted through `next/font`. Stop globally preloading the secondary JetBrains Mono font and use the system monospace stack for compact amounts and identifiers unless a later visual review proves the branded font is required.

**Rationale:** A second globally preloaded font competes with application resources while providing limited value for the operational first screen.

### Long List Rendering

**Choice:** Apply `content-visibility` and a stable intrinsic size to off-screen stream groups or cards where browser support permits, without changing pagination or accessibility semantics.

**Rationale:** The first stream page can contain multiple expanded document and entry groups. Skipping off-screen layout and paint reduces initial main-thread work while retaining the existing DOM and interaction model.

### Performance Measurement

**Choice:** Use both structural acceptance checks and reproducible bundle and Web Vitals budgets.

**Rationale:** Structural checks prove the intended architecture, while numerical budgets prevent regressions that remain technically code-split but still expensive.

## Design

The localized route must expose a route-level loading state that matches the final header, tabs, spacing, and active-tab geometry closely enough to avoid layout shift. The loading state must not require authentication, ledger data, full translation catalogs, or feature chunks. It remains visible while the authenticated page establishes its request context.

A request-scoped authenticated context resolves the session once and validates the current user record once. The protected layout, home page, ledger resolver, and access helpers that execute during the same render reuse that promise. The cache lifetime is one server request; no authorization result survives into another request.

The ledger context operation accepts the validated user and locale. It reads the user's active ledger once. If none exists, it creates the default ledger with the current conflict-safe behavior and returns the concurrently created ledger when another request wins. Its result includes the minimal ledger DTO required by the shell and active tab, so the bootstrap does not repeat an ownership lookup. All downstream repository reads remain scoped by the returned ledger ID.

After the ledger context is available, the page returns the real application shell: header, add-record command, tab navigation, and a stable active-tab fallback. Header counts may use a separate narrow asynchronous boundary if they are not already available without delaying the shell. The active tab renders through an asynchronous server component that creates a QueryClient, prefetches only the selected tab's required query keys, and returns a HydrationBoundary around that tab's client component.

Independent active-tab queries start together. For the default stream tab, attention items, counts, completed-page data, summary data, and categories must not be awaited sequentially. Queries with unavoidable dependencies, such as fetching source-document IDs before their ledger entries, may remain internally dependent unless the repository can return the combined projection in one operation without changing behavior. Recovery scheduling remains in `after()` and errors from it do not affect the rendered response.

The shell client boundary owns only URL/tab state, lightweight header interactions, and the command that opens record entry. Each tab owns its own data and feature dependencies. The initial render must not mount dynamic components merely as dormant children. A modal host may observe whether the modal stack is empty, but it imports modal implementations only after the first modal is requested. The record dialog imports only the selected entry mode after the dialog opens. Category drag-and-drop code imports only when the settings category-management workflow becomes active.

Initial stream interactions currently implemented with Framer Motion must be expressed with CSS transitions, stable layout, or immediate state changes. Pull-to-refresh must use pointer/touch events and CSS feedback without requiring Framer Motion on the initial route. Detail modals and other deferred workflows may retain motion inside their own chunks, provided those chunks are absent from the default initial graph.

Translation catalogs must be partitioned by stable feature ownership rather than assembled through runtime string manipulation. The initial stream response includes common shell, ledger page, stream, filtering, card, and other namespaces actually rendered before interaction. Activating an unloaded feature must load its component and required messages together and show its existing skeleton or pending state until both are ready. Locale selection and translation fallback behavior remain unchanged.

Shared constants must be split so client modules import plain literals or public configuration only. Runtime environment getters, startup schemas, secret-bearing field names, and server validation utilities must be reachable only from server modules. A production build inspection must confirm that the environment validation error text and private environment field catalog are absent from browser chunks.

The bundle budget is measured from a clean production webpack build. The measurement sums the gzip sizes of unique application chunks required by the locale providers, authenticated ledger page, and default stream tab, while excluding Next.js framework/runtime chunks and chunks loaded only after user intent. The baseline for this definition is approximately 290 KB gzip. The optimized result must be no more than 220 KB gzip and must not achieve the budget by removing user-visible capability.

## Interfaces and Data Flow

The request data flow is:

1. The locale route validates the locale and supplies only route-required messages.
2. The route-level loading UI can render without waiting for authenticated data.
3. A request-scoped authenticated context resolves the session and database user once.
4. A request-scoped ledger context resolves or creates the single ledger and returns its authorized minimal DTO.
5. The page emits the application shell and active-tab fallback.
6. Active-tab query promises run in parallel inside the tab's asynchronous server boundary.
7. The resulting narrow dehydrated state hydrates the existing React Query keys in the active client tab.
8. Inactive feature code and messages load on tab intent or explicit user action.

The request-scoped authentication interface returns the existing authenticated session shape plus the validated current user required by server application code. Unauthorized requests continue to redirect to the locale login route.

The ledger context returns the ledger ID, whether a default ledger was created, and a minimal authorized ledger DTO. It does not expose repository objects or mutable shared state to client components.

React Query keys, server action signatures, URL search parameters, tab values, filter serialization, mutation invalidation rules, and source-document contracts remain unchanged. Hydration boundaries may move, but cached data must continue to satisfy the existing client hooks without an immediate duplicate request.

Feature translation bundles expose the same namespace keys and translated strings as the current locale catalogs. Their physical storage may be partitioned, but callers continue to address translations by existing namespace and key.

## Errors and Edge Cases

- An unauthenticated or invalid session redirects without rendering protected ledger data.
- A deleted or disabled database user must be rejected on the next request; request caching must not extend that decision across requests.
- Concurrent first requests for a user with no ledger must retain the existing conflict-safe default-ledger creation behavior.
- A ledger-context failure renders the existing localized creation/access failure state and must not expose partial user data.
- Failure of one streamed active-tab boundary must be handled by the nearest route or tab error boundary without removing the already rendered shell.
- A rejected prefetch must not cause an infinite hydration/refetch loop. Existing React Query retry and stale-time behavior remains authoritative.
- Dynamic feature import failure must present a recoverable error or retry path rather than leaving a permanently empty dialog or tab.
- Switching tabs rapidly must not display data from the previous tab under the new tab label.
- Opening a modal or input workflow before its chunk or messages are loaded must preserve focus management, pending feedback, and keyboard dismissal behavior.
- Removing initial Framer Motion usage must not break reduced-motion behavior, list selection, expand/collapse state, pull-to-refresh, or screen-reader announcements.
- `content-visibility` must not hide focused content, break browser find/navigation, or cause scroll jumps; unsupported browsers fall back to normal rendering.
- Translation partitioning must retain missing-key diagnostics and must not flash raw keys during feature loading.
- Font changes must not alter numeric alignment enough to cause layout shift in totals, badges, or cards.
- PWA updates must not cache authenticated HTML, RSC responses, API responses, or stale user data.

## Compatibility and Rollout

No database migration, query-key migration, URL migration, persisted-state migration, or service-worker data-cache migration is required. Existing server actions and client mutation contracts remain compatible.

The work should be validated first with deterministic delayed-query tests that prove route and tab fallbacks stream before data completion. A clean production build then establishes the new bundle measurement. An authenticated preview deployment provides the Lighthouse mobile run and manual checks for login, default-ledger creation, all four tabs, filters, record entry, details, settings, logout, keyboard navigation, reduced motion, and PWA update behavior.

Performance instrumentation must compare the optimized preview with the current baseline using the same deployment region, seeded account, ledger data volume, Lighthouse mobile profile, and simulated throttling. Record at least three runs and use the median result. Interaction latency must be measured with the same scripted tab, filter, and record-dialog interactions. If the 220 KB application budget or Web Vitals targets cannot be reached without a product-visible regression, the implementation must report the remaining chunk or server timing contributors rather than silently relaxing the thresholds.

Rollout does not introduce cross-request caches, so no cache invalidation or staged data migration is needed. Existing error monitoring should be watched for authentication, dynamic import, hydration, missing translation, and ledger initialization regressions after deployment.

## Acceptance Criteria

- A route-level loading UI renders while authenticated ledger resolution is artificially delayed and closely matches the final shell geometry.
- The real header and tab navigation can be streamed before active-tab query promises resolve.
- The active-tab `Suspense` fallback is returned before its bootstrap promise completes; no page-level `await` makes the boundary ineffective.
- The underlying session evaluation and database user lookup execute no more than once during a single ledger page render request.
- The single-ledger resolution and authorization path does not repeat an owned-ledger read after returning its authorized ledger context.
- Default-ledger creation remains conflict safe under concurrent first requests.
- Independent queries for the selected tab begin without avoidable sequential awaits, and inactive-tab queries are not executed during the initial request.
- React Query hydration prevents immediate duplicate requests for successfully prefetched ledger, category, count, summary, attention, completed-page, detail, or stats data.
- The global locale provider no longer mounts a session provider solely for the settings tab, and the initial ledger route does not perform a client session fetch.
- Client chunks do not contain the startup environment validation error text or the private server environment field catalog reached through `runtimeEnv`.
- The default stream initial graph does not include Framer Motion, settings category drag-and-drop code, closed record-entry forms, detail modal implementations, or inactive tab implementations.
- Inactive tabs preload only on pointer or keyboard intent and still display the existing skeleton when activation wins the race against preload completion.
- Record-entry forms and their feature messages load only after the record dialog opens; only the selected input mode is required before it becomes usable.
- Modal implementation chunks load only after the modal stack receives its first item.
- The initial stream response does not serialize translation namespaces owned exclusively by login email, settings, stats, inactive details, or unopened modal workflows.
- Only the primary sans-serif font is globally preloaded; the first view does not preload JetBrains Mono.
- Off-screen stream groups use a safe rendering containment strategy where supported and preserve scrolling, focus, accessibility, and pagination behavior.
- A clean production webpack build reports no more than 220 KB gzip for the unique locale-provider, authenticated-page, and default-stream application chunks under the measurement definition in this specification.
- The median of at least three authenticated mobile preview runs records LCP at or below 2.5 seconds and CLS at or below 0.1, and the corresponding scripted interaction run records INP at or below 200 milliseconds.
- Login, redirect, ledger initialization, all tabs, filters, record creation, source-document details, ledger-entry details, settings, category reorder, logout, reduced-motion behavior, and PWA install/update behavior remain functional.
- Focused streaming, authentication-cache, ledger-context, hydration, lazy-loading, translation, and accessibility tests pass together with linting, type checking, and a production build.

## Open Questions

None.
