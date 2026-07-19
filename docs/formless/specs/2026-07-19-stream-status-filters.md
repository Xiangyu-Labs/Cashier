# Stream Status Filters Specification

**Status:** Approved

## Problem

The unified Stream currently keeps attention-query records visible even when they fall outside the active date or amount filters. A July view can therefore contain older queued, processing, failed, anomalous, or candidate records. Although the behavior protects visibility of pending work, it violates the ordinary expectation that a filter strictly defines the records shown in the list.

Users need two complementary workflows: inspect an exact period, amount range, and combination of source-document statuses; and immediately switch to every historical record requiring review or correction.

## Goals

- Make Stream filters strict: every visible record matches the active date, amount, and status criteria.
- Add multi-select status filtering for queued, processing, candidate pending, anomaly, failed, and completed records.
- Provide one-click global views for all records needing user action and all records currently in progress.
- Make Header count badges useful shortcuts without hiding their count meaning.
- Preserve completed-history pagination, bounded active-work loading, source-document permissions, and recovery scheduling.

## Non-Goals

- Changing source-document status transitions, candidate acceptance, retries, manual correction, or deletion.
- Adding server-side filtering to the bounded attention query solely to support the client filter controls.
- Adding saved custom filter views, shareable filter URLs beyond existing state, or a new task center.
- Changing Stats or Details-tab filter behavior except where shared filter-state types require compatible extension.

## Background

Stream obtains queued, processing, candidate pending, anomaly, and failed records through an unfiltered bounded attention query so recovery can be scheduled and active work can be refreshed. It separately obtains completed history through a date/amount-filtered cursor query. The presentation currently merges both sets and adds an `outsideCurrentFilter` marker to attention items that do not satisfy the selected date or amount range.

The Header already exposes separate processing and actionable counts. The Stream toolbar already owns date, amount, and period controls via the shared ledger filter state. This feature extends that state with source-document statuses and connects the Header counts to explicit, visible filter application.

## Decisions

### Strict Filter Intersection

**Choice:** All Stream records, including attention-query records, must satisfy every active date, amount, and status criterion before they are rendered. The outside-filter marker and filter-bypass presentation behavior are removed.

**Rationale:** A date or amount filter must be trustworthy. Status shortcuts provide a deliberate alternative for viewing outstanding work rather than silently weakening the selected filter.

### Status Selection

**Choice:** The toolbar provides a multi-select status control for `queued`, `processing`, `candidate_pending`, `anomaly`, `failed`, and `completed`. An empty selection means all statuses.

**Rationale:** Users can compose exact views such as failed-only or completed-plus-anomaly without introducing a separate screen.

### Global Status Presets

**Choice:** Provide two one-click presets that clear date and amount restrictions before applying their status set:

- `待处理`/`Needs attention`: candidate pending, anomaly, and failed.
- `处理中`/`In progress`: queued and processing.

Applying either preset displays all matching historical records, regardless of their original transaction or submission date. A visible active-filter label explains the selected preset and allows the user to clear it.

**Rationale:** A shortcut that retained July would not answer the user's need to find every unresolved record. Clearing the other list constraints makes the scope explicit and predictable.

### Header Badge Actions

**Choice:** Header count badges remain counts and are keyboard-accessible buttons. The processing badge applies the global In progress preset; the actionable badge applies the global Needs attention preset.

**Rationale:** The counts become a direct entry point to the work they summarize while retaining their existing global visibility.

### Data Fetching

**Choice:** Keep the unfiltered bounded attention query and cursor-paginated completed query. Filter their merged presentation data on the client using one shared predicate. Completed requests continue to receive compatible server date/amount constraints and are additionally filtered client-side for status consistency.

**Rationale:** This preserves recovery and pagination behavior while ensuring the UI's strict filtering rule applies to both data sources. The bounded attention collection remains small enough for client-side predicate evaluation.

## Design

The Stream toolbar gains a compact `状态`/`Status` control adjacent to existing filter controls. It opens a menu with checkboxes for the six source-document statuses, an `全部状态`/`All statuses` reset command, and two clearly separated preset commands: Needs attention and In progress. Selected statuses are shown as a concise count or localized summary, not as an unbounded row of chips.

Every standard filter modification, including status selection, uses strict intersection. For example, selecting July, amount at least 100, and Failed displays only failed records in July whose active amount meets that threshold. A status filter that produces no results shows the existing empty state without fetching or rendering filter-exempt records.

Applying a global preset clears date, period, and amount restrictions and sets only its status set. The UI shows the preset as an active filter and supplies a clear command that restores the ordinary all-status, unfiltered Stream. Selecting or deselecting individual statuses after a preset converts the view into an ordinary custom status filter; it does not automatically restore prior date or amount values.

Header count badges use buttons with localized accessible labels that include their count and action. Activating a badge updates the same filter state as the toolbar, navigates to or keeps the Stream tab active, and places focus on the Stream filter summary or heading so keyboard and screen-reader users understand the result.

The completed-page query remains date/amount constrained as an optimization. The attention query remains unfiltered. After merging and deduplication, a shared predicate checks effective date, active-projection amount, and selected status for every item before date grouping and rendering. The old outside-filter marker is removed because no rendered item can be outside the active filter.

## Interfaces and Data Flow

The shared Stream filter state adds an optional `statuses` array of `SourceDocumentStatusType` values. Its serialized representation must be stable, validated, and treated as an unordered set for query-key and URL/state comparisons.

The toolbar and Header call a single filter-update API. The global preset API sets:

- Needs attention: `statuses = [candidate_pending, anomaly, failed]`, all date/period/amount constraints cleared.
- In progress: `statuses = [queued, processing]`, all date/period/amount constraints cleared.

The collection hook accepts selected statuses along with the existing date and amount options. It returns only items that match the shared predicate, then groups and orders them as before. Its attention fetch, completed fetch, polling eligibility, counts query, and scoped invalidation contracts do not change.

Header receives filter-application callbacks from the ledger page client or a shared filter controller; it does not mutate URL state or query cache directly.

## Errors and Edge Cases

- Invalid, duplicate, or unknown serialized status values are ignored; if no valid statuses remain, the effective state is All statuses.
- An item with an unknown effective date cannot match a bounded date range; it remains visible only when no date range is active and its status and amount match.
- Pending records without active entries use the existing zero active-projection amount semantics for amount filtering.
- A candidate uses its active projection amount for amount filtering until Accept changes the official projection.
- If a Header count becomes stale between rendering and click, the preset still applies successfully and the Stream refreshes through existing query behavior.
- The Header badge remains a count, not the only path to a preset; the same preset is available from the toolbar.
- Status controls, Header badges, and reset controls remain operable by keyboard and expose their selected state and purpose to assistive technology.

## Compatibility and Rollout

The status filter is internal Web state and does not change API v1. Existing ledger URL/filter state without a status parameter remains equivalent to All statuses. Existing attention data remains bounded and unfiltered at the query layer. The implementation removes the `outsideCurrentFilter` presentation field and translations only after all Stream callers are migrated.

## Acceptance Criteria

- With a July date range active, no record whose effective date is outside July is rendered, regardless of status.
- Date, amount, and status constraints combine by intersection for both attention and completed records.
- Users can select any nonempty combination of queued, processing, candidate pending, anomaly, failed, and completed; clearing the selection returns to All statuses.
- The Needs attention preset clears date and amount constraints and displays all historical candidate-pending, anomalous, and failed records, excluding queued, processing, and completed records.
- The In progress preset clears date and amount constraints and displays all historical queued and processing records, excluding candidate-pending, anomalous, failed, and completed records.
- Header processing and actionable count badges apply the corresponding preset through the same state path as the toolbar and have accessible button labels.
- Applying, editing, or clearing a preset produces a visible filter summary and no stale filter-exempt cards.
- The attention query, completed cursor pagination, recovery refresh, count query, authorization, and mutation invalidation behavior remain operational.
- Unknown status state and dates, candidate active amount behavior, empty results, keyboard operation, and localized zh/en copy are covered by durable tests.

## Open Questions

- None
