# Unified Stream Cards Specification

**Status:** Approved

## Problem

Stream currently renders queued, processing, candidate, anomaly, and failed source documents inside a separate
`需要处理`/`Attention` section. That section is implemented as a synthetic date group with a zero total, so it breaks
the chronological ledger model and duplicates visual hierarchy. The underlying cards also do not communicate
non-completed states well: candidate actions are hidden in an overflow menu, candidate cards can resemble completed
cards, failure recovery lacks a clear primary action, and the card header silently substitutes creation time for
transaction time.

For a candidate created by reparsing a source document with an active projection, the card can show the old active
entries and total without making that ownership clear. This makes it difficult to understand what will change when the
candidate is accepted.

## Goals

- Present every source document as one consistent card in a single chronological Stream without a separate visual
  attention section.
- Make queued, processing, candidate, anomaly, failed, and completed states immediately distinguishable through text,
  icons, content, and actions rather than color alone.
- Put the primary recovery or confirmation action directly on cards that require user action.
- Give transaction time and submission/creation time distinct labels and roles.
- Let users review a candidate summary or meaningful active-versus-candidate difference before accepting it.
- Preserve bounded attention loading, refresh recovery, counts, and completed-history pagination as internal data
  mechanisms.

## Non-Goals

- Removing the attention query, processing recovery scheduling, lightweight count query, or completed-history cursor
  pagination.
- Changing candidate acceptance, abandonment, retry, manual-correction, or delete state-transition semantics.
- Redesigning the source-document detail modal beyond the data and navigation needed to support the unified cards.
- Adding batch recovery or batch candidate acceptance.
- Replacing the existing design system, typography, theme, or global navigation.

## Background

Stream currently loads a bounded attention collection independently from cursor-paginated completed history, merges
the two collections by source-document ID, and groups them by status. The UI then renders attention records in a
synthetic `需要处理` group and completed records in transaction-date groups.

The separate queries exist for correctness and performance: active work must refresh without loading historical
records, actionable records must not disappear behind completed pagination, and Header counts must remain lightweight.
Those data boundaries remain useful even when the presentation becomes a single chronological stream.

`entryDate` is the business date used to place a transaction in the ledger. `createdAt` is system metadata describing
when the source document was submitted. The current card header falls back from the former to the latter without
exposing that distinction.

## Decisions

### Unified Stream Presentation

**Choice:** Remove the visible attention section and merge attention and completed records into the same dated card
sequence. Keep the attention query and completed-history query separate underneath the UI.

**Rationale:** A processing state is a property of a transaction card, not a second ledger hierarchy. Retaining the
query boundary preserves bounded loading, recovery polling, and pagination correctness without exposing an internal
data-fetching concept to users.

### Date Grouping

**Choice:** Group every card by `entryDate` when present and fall back to `createdAt` when it is absent. A fallback date
must be explicitly identified as a submission date on the card and must not be presented as a known transaction date.

**Rationale:** This keeps every record in the chronological Stream while preventing the fallback from silently changing
business meaning.

### Date Filters and Actionable Records

**Choice:** Actionable attention records remain visible even when their effective group date is outside the active date
filter. They are inserted into their real chronological position and display a localized `筛选范围外`/`Outside current
filter` marker.

**Rationale:** Hiding candidates or failures behind a date filter can leave required work undiscoverable. A marker makes
the exception explicit without restoring a second visual section.

### Candidate Review

**Choice:** Candidate cards show a candidate summary or meaningful active-versus-candidate difference before the user
accepts. `接受`/`Accept` is the visible primary action; `放弃`/`Abandon` is secondary. The active projection remains
clearly identified and must not be presented as the candidate result.

**Rationale:** Accept replaces official ledger entries. The card must show what the action applies to rather than asking
the user to confirm an opaque state label.

### State-Specific Action Hierarchy

**Choice:** Candidate cards use Accept as the primary action, anomaly cards use Manual Correction, and failed cards use
Edit Retry. Direct Retry and Delete remain available as secondary overflow actions. Queued and processing cards show
progress without a primary action. Completed cards retain their current quiet presentation.

**Rationale:** One visible primary action gives each recoverable state a clear next step while keeping less likely or
destructive commands available without crowding the card.

### Header Counts

**Choice:** Retain Header counts, but present attention count as work requiring confirmation or correction rather than
as a link or conceptual reference to a separate attention section.

**Rationale:** The count remains useful as a lightweight global signal even though the corresponding cards now live in
the normal Stream.

## Design

Stream renders one sequence of date groups. Each group header represents an effective card date and shows a financial
total calculated only from active ledger projections belonging to that date. Pending, failed, or candidate data must
not inflate the group total. Cards returned by the attention query are deduplicated against completed pages before
grouping.

Within a date group, cards requiring user action appear before passive processing and completed cards, with stable
ordering by creation time inside each state priority. The ordering priority is:

1. `candidate_pending`
2. `anomaly`
3. `failed`
4. `processing`
5. `queued`
6. `completed`

The shared card retains a consistent outer frame, expansion behavior, evidence access, selection affordance where
supported, and detail navigation. Its state region varies as follows:

- `completed`: transaction date, title, active amount, and existing entry expansion. Completed status remains visually
  quiet.
- `queued`: transaction date when supplied, otherwise labeled submission date; queued status and evidence summary.
- `processing`: the same date treatment as queued, plus stable processing feedback that does not resize the card.
- `candidate_pending`: `新解析结果待确认`/`New result ready for review`, candidate summary or difference, explicit
  active-versus-candidate labeling, visible Accept action, and secondary Abandon action.
- `anomaly`: localized diagnostic label and explanation, evidence summary, and visible Manual Correction action.
- `failed`: localized stable failure label and recovery explanation, evidence summary, and visible Edit Retry action.

Status is expressed with an icon and text. Color may reinforce status but cannot be the only signal. Primary actions
must provide pending/disabled feedback and prevent duplicate submission. Destructive Delete continues to require its
existing confirmation dialog.

Transaction date is the primary date for completed and date-known cards. Creation time is secondary system metadata:
it is omitted from the collapsed completed card, available in details, and shown as a localized relative submission
time for queued, processing, anomaly, failed, and candidate cards when it helps explain the current state. When
`entryDate` is missing, the card must say `提交于`/`Submitted` and must not label `createdAt` as transaction time.

On narrow screens, state text and the primary command may wrap into a dedicated row. Touch targets remain at least 44
CSS pixels, amounts use tabular figures, and dynamic content must not shift the card controls. Secondary commands move
to the overflow menu before the primary action is hidden.

## Interfaces and Data Flow

The client continues to fetch:

- a bounded attention collection containing queued, processing, candidate, anomaly, and failed records;
- cursor-paginated completed history respecting the active ledger filters;
- lightweight processing and actionable counts for Header;
- source-document detail on demand.

The presentation layer merges and deduplicates attention and completed records before applying effective-date grouping
and state-priority ordering. Attention records outside the completed-history filter remain in the merged collection and
carry a derived `outsideCurrentFilter` presentation flag.

Candidate list data must be extended enough to render a truthful review summary. The contract may use a compact
candidate projection, a compact active-versus-candidate difference, or both, but it must:

- distinguish active values from candidate values;
- include only user-facing ledger fields required by the card;
- exclude raw provider responses, prompts, storage keys, processing internals, and credential data;
- avoid loading the complete revision history;
- leave the existing candidate Accept and Abandon compare-and-set identifiers intact.

Acceptance and recovery mutations continue to invalidate the attention collection, affected completed pages, Header
counts, source-document detail, and ledger statistics through their existing scoped invalidation paths. A candidate
that is accepted transitions in place to the completed presentation and moves to the appropriate transaction-date group
if its accepted date differs from its previous effective date.

## Errors and Edge Cases

- A source document with neither a valid `entryDate` nor a valid `createdAt` is rendered in a localized `日期未知`/`Date
  unknown` group and does not receive an invented current date.
- An attention record outside the active amount filter also remains visible and receives the outside-filter marker.
- A candidate whose summary cannot be loaded must not offer opaque one-click acceptance on the collapsed card; the
  primary action opens detail review or is disabled with a recoverable error state.
- If active and candidate summaries are identical, the card states that no ledger-entry difference was detected while
  still allowing Accept or Abandon.
- A candidate with no active projection is invalid for `candidate_pending`; the UI uses the server-provided status and
  supported actions and does not infer acceptance capability locally.
- Unknown anomaly or failure codes use the existing safe localized fallback while retaining the stable code for
  diagnostics.
- Failed primary actions remain disabled while their mutation is pending and surface localized success or error
  feedback.
- Deduplication prefers the fresher attention record for a source-document ID and must not render the same card twice
  during a status transition.
- Date grouping and movement preserve stable card identity so status refreshes do not create duplicate cards or
  incoherent layout jumps.
- Selection and batch date editing apply only where the existing business rules allow them; attention visibility does
  not implicitly make every state batch-editable.

## Compatibility and Rollout

The existing attention and completed endpoints remain available and retain their pagination and recovery behavior.
Candidate summary fields are additive to internal Web DTOs and do not change the API v1 request or response format.
Existing persisted revisions and source documents require no destructive migration; a schema migration is needed only
if the selected compact candidate read model cannot be derived efficiently from existing revision-entry storage.

Rollout is covered by updated unit and integration tests for merging, grouping, date-filter exceptions, candidate
summary mapping, action visibility, and mutation transitions. The visual change ships as one Stream presentation
replacement so users do not encounter both the old attention section and unified cards simultaneously.

## Acceptance Criteria

- Stream contains no visible `需要处理`/`Attention` section or synthetic attention date group.
- Queued, processing, candidate, anomaly, failed, and completed source documents render as the same card family inside
  chronological date groups.
- The attention query, bounded loading, refresh coordinator, completed cursor pagination, and lightweight Header counts
  remain operational.
- Cards use `entryDate` for business grouping and explicitly label `createdAt` as submission time whenever it is used as
  the fallback.
- No card presents a fallback creation time as a known transaction date.
- Actionable records outside the current date or amount filter remain visible at their chronological position and show
  the localized outside-filter marker.
- Date-group totals include active ledger projections only and are not changed by queued, failed, anomalous, or
  unaccepted candidate values.
- Candidate cards visibly state that a new result awaits review, show a truthful candidate summary or difference, and
  provide a direct Accept action plus a secondary Abandon action.
- Candidate cards never label an old active total as the candidate result.
- Anomaly cards expose Manual Correction as their primary action; failed cards expose Edit Retry; Direct Retry and
  Delete remain secondary actions.
- Queued and processing cards communicate progress without showing an invalid recovery action.
- Every visible state uses text or an icon in addition to color, all primary actions have pending feedback, keyboard
  focus remains visible, and mobile touch targets are at least 44 CSS pixels.
- At 375, 768, 1024, and 1440 CSS-pixel widths, card text and actions do not overlap, truncate essential state meaning,
  or cause horizontal scrolling.
- Automated tests cover deduplication during status transitions, effective-date fallback, unknown dates, outside-filter
  attention records, candidate active-versus-candidate labeling, exact primary-action matrices, and Accept transition
  into completed history.

## Open Questions

- None
