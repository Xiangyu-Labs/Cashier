# Retry With Active Result Status Specification

## Problem

The Stream presents a source document's current pending retry outcome but does not explain that an existing active ledger projection remains effective. A failed or anomalous retry can therefore look like the recorded transaction has failed, even though its active entries are unchanged. The Stream header also renders the human-readable diagnostic label twice, such as `Unsupported Document` followed by an identical diagnostic badge.

Historical documents created through the retired Manual Correction flow can be typed as `manual` while their active revision has no entries. They are distinguishable from a genuine Quick Entry but are outside this change's data-repair scope.

## Goals

- Make it clear on Stream cards and in details that a failed or anomalous retry does not replace an existing active projection.
- Show the retained active projection's entry count and total when a retry is failed or anomalous.
- Render each card-header diagnostic label once.
- Preserve current retry, candidate, active-projection, and deletion semantics.

## Non-Goals

- Migrate, repair, hide, or delete historical manual source documents with empty active revisions.
- Change the Quick Entry creation flow or the persisted `manual` document type.
- Change revision state transitions, candidate Accept/Abandon behavior, or retry behavior.
- Alter diagnostic-code taxonomy, localization content, or error mapping.

## Background

A source document may have both an active revision and a pending revision. A retry creates the pending revision while retaining the active projection. The read model exposes the pending outcome as `anomaly` or `failed`; a completed pending revision becomes `candidate_pending` and requires explicit acceptance before it replaces the active projection.

The retired Manual Correction flow could mark an anomalous document as `manual` and activate an empty completed revision. Such historical data may therefore show the Quick Entry label and zero detail items, but current Quick Entry atomically creates one ledger entry and the retired flow is no longer callable.

## Decisions

### Historical Empty Manual Records

**Choice:** Do not migrate or add special handling for historical `manual` documents whose active revision has zero entries. The user will remove the known record manually.

**Rationale:** The record is a bounded legacy artifact from the removed Manual Correction path. A migration or compatibility presentation adds risk and scope without improving the current lifecycle.

### Failed Retry With Active Projection

**Choice:** For `anomaly` and `failed` documents with an active revision, the Stream state panel and detail surface explicitly state that the existing ledger entries remain active. They show the active projection's entry count and main-currency total.

**Rationale:** The pending retry outcome needs attention, but must not imply that previously recorded bookkeeping data was lost or invalidated.

### Diagnostic Header Presentation

**Choice:** The Stream header renders one localized, human-readable diagnostic label. It removes the duplicate diagnostic-code badge from the header. The expanded state panel or detail view remains the place for explanatory diagnostic information.

**Rationale:** The existing label and badge resolve to the same localized phrase, creating redundant visual noise without conveying additional recovery information.

## Design

The source-document read model will provide a compact active-projection summary for cards in `anomaly` and `failed` states when `activeRevisionId` is present: active entry count and total in the ledger's main currency. This summary is distinct from candidate comparison data and is derived only from non-deleted ledger entries belonging to the active revision.

The Stream state panel for a failed or anomalous retry with this summary will include a localized retention message and the summary. A failed or anomalous first parse, which has no active revision, retains its current recovery-focused presentation without a retention message.

The details view uses the same condition to state that visible entries are the retained active result while the current retry requires attention. It continues to render the active entries; it must not render entries from the failed or anomalous pending revision.

`ProcessingStatus` remains responsible for status icon and label in the card header. When the status is an error, it no longer renders a separate translated diagnostic badge. The existing title/description affordance for diagnostic explanation may remain on the primary status label or be available from the state panel/detail diagnostic section.

## Interfaces and Data Flow

- Extend the Stream/source-document DTO with an optional active-projection summary for `anomaly` and `failed` documents that have an active revision.
- The PostgreSQL read model queries non-deleted `ledger_entries` for `source_document_revision_id = activeRevisionId` and maps count plus converted main-currency total.
- `SourceDocumentCardStatePanel` receives the optional summary and renders it only for anomaly/failed states.
- `SourceDocumentDetailModal` or its detail content receives the same source-document DTO and renders the retention notice when the summary is present.
- No mutation contract, persistence write path, or revision pointer behavior changes.

## Errors and Edge Cases

- A failed or anomalous first parse has no active revision: show the existing error/recovery UI and no active-result summary.
- An active revision with zero entries still produces a truthful `0 entries / 0.00` summary if it exists; this change does not infer or repair historical data.
- A completed pending revision with an active revision remains `candidate_pending` and continues to use candidate comparison, not the failure/anomaly retention UI.
- Soft-deleted entries are excluded from the active-projection summary.
- Missing conversion values follow the existing source-document total convention; the UI must not fabricate a main-currency total.

## Compatibility and Rollout

This is a backward-compatible read-model and presentation change. No database migration is required. Existing historical manual data remains untouched. Clients receive the additional optional DTO field through normal query refetch and cache invalidation.

## Acceptance Criteria

- A document with active entries and a failed retry displays the failure status plus a localized statement that the active result remains in use, including the active entry count and total.
- A document with active entries and an anomalous retry provides the same retained-result clarity.
- A failed or anomalous first parse does not claim that an active result exists.
- Details continue to show only active entries while a retry is failed or anomalous, and identify them as the retained active result.
- A card with `unsupported_document` displays `Unsupported Document` once in its header, not once as status text and again as an identical badge.
- A successful retry with an active revision remains a candidate and continues to require Accept before replacing the active projection.
- Existing Quick Entry and retry behavior remain unchanged.

## Open Questions

None
