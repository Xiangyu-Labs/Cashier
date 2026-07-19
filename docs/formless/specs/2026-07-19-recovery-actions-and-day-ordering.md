# Recovery Actions and Day Ordering Specification

## Problem

Stream currently orders same-day cards by status and then oldest submission first. Details relies on its paged query order rather than explicitly preserving newest-first order after date grouping. The product also exposes Manual Correction, a recovery path that bypasses AI parsing and creates an editable manual revision, despite Retry and Edit Retry covering the intended recovery workflow.

## Goals

- Show Stream and Details items within the same date group from newest to oldest.
- Retain Retry for reprocessing unchanged evidence.
- Retain Edit Retry for changing evidence before reprocessing.
- Completely remove Manual Correction from product behavior and implementation.

## Non-Goals

- Change cross-day ordering, which remains newest date first.
- Change candidate Accept or Abandon behavior.
- Change the semantics of Retry or Edit Retry.
- Migrate or delete existing historical manual source-document revisions.

## Background

Manual Correction is available only for failed or anomalous source documents. It copies pending-revision text and stored files to a completed revision, activates that revision, marks the document as manual, and permits direct entry editing without running parsing. Retry instead reuses evidence for parsing; Edit Retry lets users modify text, files, or date before parsing.

## Decisions

### Same-Day Ordering

**Choice:** Stream and Details sort items in each date group by creation time descending, with a stable descending ID tie-breaker.

**Rationale:** Recent submissions are more likely to be the user's current work and should consistently appear first across both views.

### Recovery Actions

**Choice:** Failed and anomalous documents retain Retry and Edit Retry but no longer expose Manual Correction.

**Rationale:** Edit Retry provides the user-controlled evidence correction path while keeping the source-document lifecycle consistent with AI parsing.

### Removal Scope

**Choice:** Remove Manual Correction end to end: supported action contract, server action, application use case, persistence adapter operation, React mutations and callbacks, UI controls, translations, and dedicated tests.

**Rationale:** A UI-only removal leaves unsupported product behavior and dead code. Historical manual revisions remain readable and unchanged.

## Design

The Stream grouping comparator will use source-document `createdAt` as its primary intra-day sort key in descending order. Details will explicitly sort entries by `createdAt` before date grouping. Both use descending IDs when timestamps are equal.

The source-document action contract will no longer emit `manual_correction`. All UI components and mutation hooks that consume it will be simplified. The Manual Correction server action, application use case, PostgreSQL transaction implementation, exports, and dedicated integration tests will be removed. Existing Retry and Edit Retry continue to create queued revisions and preserve their current validation and invalidation behavior.

## Interfaces and Data Flow

`supportedSourceDocumentActions` returns Retry, Edit Retry, and Delete for failed/anomalous pending revisions; it no longer returns `manual_correction`.

Stream and source-document detail surfaces consume only the retained recovery actions. No client may call a Manual Correction server action after this change.

## Errors and Edge Cases

- Existing source documents of type `manual` and completed manual revisions remain visible and editable as historical data.
- Failed or anomalous documents continue to offer Edit Retry when evidence must change and Retry when it does not.
- Equal creation timestamps sort deterministically by ID descending.

## Compatibility and Rollout

This is a removal of an internal application action with no database migration. Existing manual data is not modified. Cached clients refresh through existing query invalidation after retained recovery actions.

## Acceptance Criteria

- Stream lists same-date cards newest first, regardless of their status.
- Details lists same-date entries newest first after date grouping.
- Failed and anomalous documents expose Retry and Edit Retry but not Manual Correction.
- No source code, translation catalog, or automated test retains Manual Correction runtime behavior.
- Existing historical manual source documents remain readable.
- Focused unit and integration tests covering grouping and retained recovery actions pass.

## Open Questions

None
