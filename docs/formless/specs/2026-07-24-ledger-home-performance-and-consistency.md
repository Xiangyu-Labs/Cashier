# Ledger Home Performance and Consistency Specification

## Problem

The authenticated ledger home page does not stream useful UI while its active-tab bootstrap is running because the route awaits authentication, home resolution, authorization, and all bootstrap queries before returning its `Suspense` boundary. The shared locale layout also sends providers, complete translation catalogs, two preloaded fonts, and client feature graphs that the default Stream view does not need.

Stream loading is split across an unpaginated attention query and a completed-only infinite query. The client merges those independently ordered collections and sorts them again by effective date. A page described as 20 completed records can therefore render those 20 records plus every matching attention record, including attention records that belong beyond the current cursor boundary. The sentinel follows the merged collection while `hasNextPage` belongs only to completed history, so the visible order and pagination order are not one sequence and loading can appear to stop.

Revision refresh is centralized but still invalidates attention, completed history, and counts together. A new-submission notification resets its backoff counter without cancelling an existing timer, hidden-page checks do not cover every scheduling path, failed cycles advance as if successful, and browser tabs do not coordinate ownership. Optimistic mutations use incompatible snapshots and ad hoc cache writes. A single ref identifies the current create placeholder, concurrent submissions can reconcile the wrong item, retry updates only one detail cache, and mutations can leave list, detail, count, and summary projections temporarily contradictory.

## Goals

- Stream a stable authenticated ledger shell and active-tab fallback before active-tab data queries complete.
- Remove avoidable same-request authentication, user, ledger, and authorization reads from the initial critical path.
- Reduce initial JavaScript, RSC payload, translations, fonts, and inactive feature code relative to a reproducible pre-change baseline.
- Make Stream one server-paginated chronological sequence containing all non-deleted statuses, with 20 total records per page before end-of-list.
- Apply date, amount, and status filters on the server before pagination so page cursors and visible ordering describe the same result set.
- Load older pages without duplicates or omissions while allowing newly created server records to reconcile at the top.
- Retain global header counts independently of the current Stream filters.
- Use one adaptive refresh coordinator per browser profile, with one network-owning tab, targeted refreshes, immediate wake-up after relevant actions, and no polling while offline or hidden.
- Make create, retry, edit, accept, abandon, delete, and other Stream mutations immediately responsive, concurrency-safe, reversible on failure, and consistent across visible projections.
- Preserve user-visible product behavior, accessibility, authentication, ledger ownership, public API v1 contracts, and persisted accounting semantics.

## Non-Goals

- Introduce WebSocket, Server-Sent Events, Redis, a queue, a background worker, or a cron service.
- Move the authenticated initial render entirely to client-side fetching.
- Cache authorization decisions or authenticated user data across requests.
- Redesign the navigation model, visual language, filter controls, record-entry workflows, or settings experience.
- Break public `/api/v1` request or response contracts, require credential rotation, or change accounting rules.
- Require a database migration unless implementation evidence shows that the existing stable ordering cannot be preserved without one.
- Set an absolute bundle-size or Web Vitals threshold before measuring the current application in a reproducible environment.
- Optimize unrelated administrative, authentication, or infrastructure workflows that do not contribute to the ledger home path.

## Background

The locale layout currently calls `getMessages()` and provides the complete catalog to one global `NextIntlClientProvider`. It mounts `SessionProvider`, React Query, theme state, notifications, and both Inter and JetBrains Mono for every localized route. The home route authenticates after the protected layout has already authenticated, resolves the user's ledger, then awaits `getLedgerPageBootstrap()` before returning a boundary. The bootstrap authorizes the same ledger again and prefetches categories plus every query needed by the selected tab.

The Stream hook independently fetches a hard-limited attention collection and a completed-only infinite collection. Attention ignores server-side date and amount filters; the browser filters and merges it with completed pages. Database pagination already uses a stable tuple based on business date, creation time, and ID, but that cursor only covers the completed query while presentation covers both collections.

The revision refresh coordinator shares a timer across mounted consumers and uses staged backoff. It pauses after visibility and offline events and deduplicates callbacks by scope, but every Stream refresh invalidates three collections. `notifyNewSubmission()` does not force an immediate request if a timer already exists. The coordinator is isolated per browser tab and does not distinguish a successful unchanged response, a changed response, and an error when selecting the next delay.

The mutation layer supports query cancellation, snapshots, rollback, and selective invalidation. Individual hooks nevertheless use different cache shapes and reconciliation rules. Source-document creation places a temporary item in attention, stores its identity in one mutable ref, later changes only its ID, and then fires broad invalidations. Other actions often wait for invalidation instead of supplying a complete optimistic projection.

This specification specializes and updates the relevant portions of `2026-07-20-initial-render-performance.md`, `2026-07-20-global-performance-optimization.md`, and the bounded Stream design in `2026-07-18-remaining-product-completion.md`. Where those documents describe an attention collection rendered in addition to completed pages, this specification's unified Stream pagination takes precedence.

## Decisions

### Optimization Scope

**Choice:** Optimize the authenticated ledger home route, its shared locale/provider path, the Stream read model, refresh coordination, and Stream-facing mutations. Other tabs are changed only where shared boundaries or cache contracts require it.

**Rationale:** These parts jointly determine first-screen latency and the reported loading and consistency failures while keeping the effort bounded to one user workflow.

### Rendering Strategy

**Choice:** Preserve server rendering and React Query hydration, return a route-level fallback immediately, and move active-tab bootstrap work into a real asynchronous `Suspense` subtree with the narrowest practical hydration boundary.

**Rationale:** This removes the server waterfall without adding a browser fetch waterfall or changing the authenticated rendering model.

### Request-Scoped Identity and Ledger Context

**Choice:** Deduplicate session, database-user validation, home-ledger resolution, and authorized ledger materialization with request-scoped React caching. Do not introduce cross-request authorization caching.

**Rationale:** The same render currently repeats identity and ledger work. Request scope removes duplication without delaying revocation or weakening authorization.

### Initial Client Graph

**Choice:** Scope providers and translations to the routes and features that consume them, use direct statically analyzable dynamic imports, defer inactive tabs and closed workflows until intent, remove the secondary global font, and keep Framer Motion out of the default Stream graph.

**Rationale:** These are high-impact bundle rules from the Vercel React guidance and directly address code currently loaded before the user needs it.

### Unified Stream Pagination

**Choice:** Replace the rendered attention-plus-completed merge with one server query over all non-deleted source-document statuses. The default page size is 20 total records, not 20 completed records plus attention records.

**Rationale:** A single result set makes ordering, filtering, `hasNextPage`, and the scroll sentinel refer to the same sequence.

### Stream Ordering

**Choice:** Order by effective business date descending, then creation timestamp descending, then ID descending. Effective business date is `entryDate` when present and the calendar date of `createdAt` otherwise. The server returns an opaque cursor encoding the same tuple.

**Rationale:** This retains the current business-oriented presentation while giving every record, including queued and processing records, a deterministic position in the paginated sequence.

### Filter Semantics

**Choice:** Apply date range, amount range, and selected statuses in the server query before its limit and cursor. Header processing and attention counts remain global ledger counts and do not inherit Stream filters.

**Rationale:** Server filtering fills pages with matching results and prevents client filtering from invalidating page-size and cursor assumptions. Global counts must continue to alert the user to work hidden by a filter.

### New and Historical Records

**Choice:** Downward scrolling loads the next older unified page. A newly created or externally observed record that sorts ahead of the first page is reconciled into the top window without discarding already loaded history. Ordering-field changes that could move an item across a cursor boundary trigger a canonical window rebase rather than an unsafe local move.

**Rationale:** Inserts above a keyset cursor do not invalidate older cursors, but arbitrary sort-key changes can. Distinguishing these cases preserves scroll continuity and correctness.

### Refresh Transport and Ownership

**Choice:** Keep HTTP-based adaptive polling and use one centralized coordinator. Across tabs for the same origin, elect one visible network owner using browser coordination primitives; broadcast refresh signals and canonical deltas to follower tabs. Fall back to independently safe polling when the coordination primitive is unavailable.

**Rationale:** HTTP polling fits the current Vercel and request-bound processing architecture. Cross-tab ownership removes redundant traffic without making correctness depend on leader election.

### Adaptive Refresh Policy

**Choice:** Refresh only while there is locally known transitional work or a lightweight server signal indicates relevant change. Pause while offline or hidden; wake immediately on submit, retry, focus, reconnect, and leader acquisition; use a fast interval initially; progressively back off unchanged successful cycles; use a separate capped error backoff; add jitter; and allow only one in-flight cycle.

**Rationale:** State-aware scheduling improves freshness after actions while avoiding synchronized, continuous broad invalidation.

### Targeted Refresh and Reconciliation

**Choice:** A refresh cycle obtains a lightweight ledger revision signal or change set and updates only affected resources: visible Stream entities, the first page when membership changes, relevant details, and global counts. Completed history pages are not refetched merely because some processing item is unchanged.

**Rationale:** Polling should transfer and render data proportional to actual change, not the size of loaded history.

### Optimistic Transaction Model

**Choice:** Replace per-hook ad hoc snapshots with operation-scoped cache transactions. Each mutation has an operation ID, captures only the entities and projections it changes, applies immutable patches, and records enough version information for a conditional rollback.

**Rationale:** A failed older mutation must not overwrite a newer successful mutation. Operation identity and conditional rollback make concurrent actions deterministic.

### Canonical Mutation Results

**Choice:** Internal mutation actions return the minimal canonical DTOs and count/version information required for reconciliation. Successful operations merge those results directly; invalidation is a recovery mechanism, not the normal success path. Public API v1 contracts remain unchanged.

**Rationale:** Direct server reconciliation eliminates the latency and temporary contradictions caused by broad post-mutation refetches while allowing internal breaking changes.

### Optimistic Creation Identity

**Choice:** Every submission carries a client submission ID through the internal create contract. The optimistic overlay keys the placeholder by that ID, supports multiple concurrent submissions, and atomically maps it to the returned source-document ID without a shared mutable ref.

**Rationale:** Per-operation identity prevents concurrent responses from replacing or removing the wrong placeholder and makes refresh deduplication explicit.

### Compatibility Boundary

**Choice:** Internal query keys, hook APIs, hydration DTOs, server actions, and component ownership may change incompatibly. Public API v1, database data semantics, URLs, authentication behavior, and user-visible workflows remain compatible.

**Rationale:** Internal breaking changes allow coherent data ownership without imposing an external migration on users or service clients.

### Performance Validation

**Choice:** Record a reproducible pre-change baseline and require material relative improvement in initial response streaming, initial application payload, user-visible render timing, and polling request volume. Do not adopt hard absolute size or Web Vitals gates in this phase.

**Rationale:** The selected acceptance model values measured improvement while avoiding an arbitrary target disconnected from the available preview environment.

## Design

The localized route gains a route-level loading UI whose shell, tabs, and content geometry match the resolved page closely. Authentication and home-ledger resolution execute in an asynchronous server subtree using request-cached identity and ledger helpers. Once the minimal ledger shell context is available, the route returns the shell and a tab-specific fallback. A tab bootstrap component creates its own query client, starts independent queries together, and dehydrates only data used by the active tab.

The root locale layout no longer supplies every client concern to every route. Server components select the translation namespaces required for their route and active feature. React Query, notifications, theme behavior, and any authenticated account DTO are placed at their lowest shared consumer boundary. The default Stream path uses direct module imports for its dynamic boundaries. Inactive tabs preload on pointer or keyboard intent, while record forms, modal implementations, drag-and-drop settings, and other closed features load only when activated. Simple initial Stream transitions and pull-to-refresh feedback use CSS and browser events rather than Framer Motion.

The Stream server read accepts ledger ID, normalized filters, page size, and an opaque cursor. Its status domain includes queued, processing, candidate pending, anomaly, failed, and completed, and excludes deleted records. It derives one effective date expression that is shared by filtering, ordering, and cursor comparison. It fetches `limit + 1`, returns at most 20 records, and emits a next cursor only when another matching row exists. Associated active ledger-entry projections are fetched in a bounded batch for the returned IDs.

The browser stores canonical Stream pages under one filter-specific query family. Rendering flattens pages and deduplicates by source-document ID without re-sorting them into a different order. Optimistic creations live in an overlay associated with the same ordered window until reconciled. A record known to sort ahead of the first canonical row may be prepended. Records returned in a later page are deduplicated against earlier pages and overlays. The load-more sentinel depends only on the unified query's next cursor and remains after the rendered canonical window.

Changing a filter creates a distinct server-filtered query. Date, amount, and status predicates are normalized identically in the route bootstrap, client key, server action, and repository. A page can contain fewer than 20 records only at end-of-list or when concurrent deletion changes the dataset between requests. Counts in the application header use their independent unfiltered aggregation contract.

The refresh coordinator models `stopped`, `scheduled`, `refreshing`, and `backing-off` states. Scheduling requires a subscriber, a visible document, an online browser, and either transitional work or a server-signal watch. New submissions and relevant actions cancel any scheduled timer and queue one immediate single-flight refresh. Focus, reconnect, and visibility restoration coalesce into the same wake-up. A hidden or offline transition cancels the timer; a refresh that loses eligibility before completion cannot schedule another cycle.

Successful unchanged cycles advance normal backoff. Successful changed cycles reset or shorten it while transitional work remains. Errors advance a separate capped exponential backoff and never masquerade as successful unchanged results. All scheduled delays receive bounded jitter. The coordinator exposes deterministic environment and clock interfaces so these transitions are unit-testable.

Cross-tab coordination uses a ledger-scoped channel and a renewable leader lease. Only a visible eligible leader performs network refreshes. It broadcasts signal versions and canonical deltas; followers apply newer versions and do not echo them. Leadership loss, tab closure, stale leases, unsupported APIs, and simultaneous acquisition are handled so duplicate requests may occur briefly but state remains idempotent and polling never stops permanently.

The lightweight refresh response identifies whether Stream membership, visible entity content, details, or counts changed since the client's token. Entity-only status changes patch matching IDs across loaded pages and details. A new top record is inserted or reconciled in the first window. A change to effective date or another ordering field that can cross a loaded cursor boundary marks the canonical Stream window for a controlled rebase. A rebase preserves the user's scroll anchor where possible and never combines pages from incompatible cursor generations.

Optimistic state is represented as operations over canonical entities rather than complete-query snapshots. An operation records its ID, affected entity IDs or client submission ID, base entity version, forward patch, inverse patch, and projected count changes. Rendering composes pending operations in creation order over canonical data. On success, the returned canonical entity replaces the acknowledged operation's base and remaining newer operations are replayed. On failure, only that operation is removed or inverted; later operations remain intact. Stale server or polling responses are ignored by entity version or refresh token.

Creation inserts a temporary queued card at the correct top position immediately. The client submission ID is sent with the request and is used for idempotent reconciliation. Retry, edit, candidate accept/abandon, and delete patch the same entity wherever it is visible, including Stream pages and open detail state. Counts and summaries receive optimistic deltas only when the transition is known locally and reversible; otherwise they retain the previous value until the canonical response arrives. A failure restores the prior visible state and presents the existing localized error feedback.

Before implementation, capture the current production-build application chunks and gzip sizes for the default Stream graph, the serialized initial messages and hydration payload, server timing to first fallback and useful shell, and polling requests over a representative processing lifecycle in one and multiple tabs. Repeat the same measurements with the same data, browser profile, network settings, and build mode after the change. The result is accepted only when it shows material improvement without shifting work into a later blocking waterfall.

## Interfaces and Data Flow

The initial request flow is:

1. The locale route validates the locale and starts request-scoped identity and home-ledger resolution.
2. The route-level loading UI can stream without waiting for ledger queries or inactive feature code.
3. Request-cached identity validates the session and database user once.
4. Request-cached home context resolves, creates when necessary, and authorizes the user's ledger once.
5. The real shell renders with a tab fallback.
6. The active Stream bootstrap fetches ledger shell data, categories, global counts, the first unified Stream page, and summary data in parallel where independent.
7. A narrow hydration boundary supplies only the active Stream query family and shared shell data.

The unified Stream page contract is conceptually:

```ts
interface ListStreamPageInput {
  ledgerId: string;
  filters: {
    startDate?: string;
    endDate?: string;
    minAmount?: number;
    maxAmount?: number;
    statuses?: SourceDocumentStatus[];
  };
  cursor?: string;
  limit: 20;
}

interface StreamPage {
  items: SourceDocumentListItemDto[];
  nextCursor: string | null;
  generation: string;
}
```

`generation` identifies cursor-compatible canonical windows. Its representation is internal and may be a stable query revision or other opaque token; it must not expose database internals.

The internal mutation result is conceptually:

```ts
interface MutationReconciliation<T> {
  operationId: string;
  clientSubmissionId?: string;
  entity: T | null;
  entityVersion: string;
  countPatch?: Partial<SourceDocumentCountsDto>;
  streamMembershipChanged: boolean;
  orderingChanged: boolean;
}
```

The refresh data flow is:

1. An eligible action or transitional entity registers the ledger with the coordinator.
2. The visible leader schedules one jittered refresh and followers wait for broadcasts.
3. The leader requests changes since its last token.
4. The response patches versioned visible entities and counts, inserts a new top record, or requests a canonical window rebase.
5. The leader broadcasts the newer token and reconciliation payload.
6. The next delay is selected from changed, unchanged, failed, stopped, hidden, and offline outcomes.

## Errors and Edge Cases

- An invalid, expired, cross-ledger, or generation-incompatible cursor returns a stable validation result and restarts from the first page without mixing generations.
- Concurrent inserts above the current cursor do not duplicate or skip older pages; client deduplication remains a defense, not the source of ordering correctness.
- An edit that changes effective date across a loaded cursor boundary triggers a controlled rebase.
- A record transitioning between queued, processing, candidate pending, anomaly, failed, and completed retains one identity and one position determined by the canonical ordering tuple.
- A newly submitted placeholder and an early polling response for its server entity deduplicate through client submission ID and source-document ID.
- Multiple simultaneous submissions settle independently even when responses arrive out of order.
- A failed older mutation cannot roll back a newer mutation on the same entity.
- A stale poll response cannot overwrite a newer mutation response or optimistic operation.
- Offline mutation failures preserve actionable UI feedback; reconnect performs one coalesced canonical reconciliation.
- Hidden pages, React remounts, Strict Mode effects, and multiple tabs do not leave orphan timers or permanently suppress refresh.
- Leader-election failure may temporarily duplicate requests but cannot make a tab trust unversioned or cross-ledger data.
- A polling error does not clear visible data, advance success backoff, or create repeated error toasts.
- Global counts can report work excluded by active Stream filters; activating the relevant status preset produces a server-filtered unified page.
- Empty filtered pages, deletion of the last row in a page, and end-of-list render a stable no-results or no-more state without a refresh loop.
- Dynamic feature or translation loading failure is caught by the existing route or feature error boundary and does not break the shell.
- Authentication revocation and ledger deletion remain effective on the next request because no cross-request authorization cache is added.

## Compatibility and Rollout

Implementation may replace the existing attention and completed query keys, collection hook, mutation helper APIs, hydration payloads, and internal server-action responses in one coordinated change. Call sites and tests in the repository migrate together; long-term compatibility adapters for retired internal contracts are not required.

Public API v1 contracts, route URLs, service credentials, stored data, authentication behavior, locale selection, ledger ownership, and accounting results remain compatible. If implementation determines that a schema index or generated ordering column materially improves the unified query, it requires an additive migration with an independently reviewed query plan; the product semantics in this specification do not depend on that migration.

Rollout records a baseline first, then lands request/render boundaries, unified pagination, refresh coordination, and optimistic transactions in reviewable increments behind the same user-visible Stream contract. During deployment, monitor authentication errors, cursor validation failures, missing translations, hydration mismatches, duplicate records, refresh request volume, and mutation rollback errors. Internal telemetry must not include source-document text, file contents, credentials, or user-identifying payloads.

The prior rendered attention-plus-completed contract is retired rather than maintained in parallel. A rollback returns the entire Stream data layer to its previous version; mixed clients and server actions must either remain wire-compatible during the deployment window or reject incompatible generation tokens and restart safely from page one.

## Acceptance Criteria

- A reproducible baseline records initial application chunks, gzip payload, initial messages and hydration size, fallback and useful-shell timing, and one-tab and multi-tab polling request counts before implementation.
- The route-level fallback is observable before active Stream bootstrap queries resolve, and the active tab no longer sits behind a completed bootstrap followed by a no-op `Suspense` boundary.
- One request does not repeat session, database-user, home-ledger, or ledger-authorization work that can be shared safely within that request.
- Independent active-tab server queries start in parallel and inactive-tab queries do not run during the default Stream request.
- The post-change default Stream graph, serialized initial data, useful render timing, and representative polling traffic materially improve relative to the recorded baseline under the same measurement conditions.
- The default Stream graph excludes the secondary font, global client session provider, Framer Motion, inactive tabs, closed record forms, modal implementations, and settings-only drag-and-drop code.
- The initial Stream response does not serialize translation namespaces owned only by login, inactive tabs, settings, or unopened workflows.
- With no active filters, each non-terminal Stream page contains at most 20 total non-deleted records across all statuses, rather than 20 completed records plus separately fetched attention records.
- Date, amount, and status filters are applied before pagination and can load every matching record through the unified cursor without duplicates or omissions.
- Automated fixtures containing interleaved queued, processing, candidate pending, anomaly, failed, and completed records prove that visible order, cursor order, and sentinel order are identical.
- Loading older pages continues until the unified server cursor returns `null`; attention records outside the first page do not appear early or push the sentinel beyond the canonical window.
- New records can reconcile at the top while previously loaded older pages remain available and deduplicated.
- Ordering-field edits and incompatible generation changes trigger a safe rebase without mixing incompatible pages.
- Header counts remain global and correct while Stream filters produce a separately paginated result set.
- New submission, retry, focus, reconnect, and leader acquisition cancel an existing delay and cause one immediate coalesced refresh when eligible.
- Polling stops without an active reason, while offline, and while hidden; unchanged success, changed success, and error outcomes select distinct tested backoff behavior with bounded jitter.
- Two visible tabs normally produce one ledger refresh stream, followers receive versioned updates, and leader loss causes another eligible tab to take over.
- Refresh cycles do not refetch completed history or unrelated details when only an unchanged processing signal is observed.
- Concurrent optimistic submissions reconcile by operation and client submission IDs even when server and polling responses arrive out of order.
- Create, retry, edit, accept, abandon, and delete update every visible representation of the affected entity and reconcile to canonical server results without depending on broad success invalidation.
- Failure of one optimistic operation rolls back only that operation and cannot overwrite a later operation on the same entity.
- Focused unit, integration, and UI tests cover cursor boundaries, filters, generation resets, refresh state transitions, cross-tab failover, stale responses, optimistic concurrency, rollback, and canonical reconciliation.
- Linting, type checking, relevant tests, a production build, and desktop and mobile Stream interaction verification pass.

## Open Questions

None.
