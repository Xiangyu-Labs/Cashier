# Stream Card and Refresh Reliability Specification

## Problem

The stream UI duplicates source-document states in a header badge and a large panel below the card header. Regular scrolling content can also render above the sticky application header. The image removal control overwhelms its preview. Calendar heatmap amounts use long ISO currency codes instead of compact, recognizable symbols. Finally, the asynchronous parsing path drops a ledger's saved custom AI prompt, and the refresh coordinator does not meet its documented independent-refresh fallback when leader election cannot succeed.

## Goals

- Keep each source-document state in one consistent header location, with actions still reachable from the card menu.
- Keep the application header above ordinary scrolling content while preserving overlays and menus that must intentionally appear above it.
- Make image removal a compact overlay control that does not obscure the preview.
- Render heatmap amounts with localized currency symbols while retaining an unambiguous fallback for unsupported currencies.
- Apply the currently saved ledger custom prompt to every parsing attempt, including direct and edited retries.
- Ensure refresh polling continues when cross-tab leader election is unavailable, without overlapping requests or polling hidden/offline tabs.

## Non-Goals

- Redesign the source-document detail view or remove candidate/retry actions.
- Change the persisted evidence used by a retry.
- Change the parser's accounting rules or model selection.
- Change currency presentation outside the calendar heatmap.
- Replace polling with a persistent connection.

## Background

`SourceDocumentCard` renders `SourceDocumentCardHeader` and `SourceDocumentCardStatePanel`; the header already has a status affordance and menu actions, while the panel repeats state copy and presents duplicate recovery controls. The sticky header uses the `z-header` token, whereas regular visual descendants can establish competing stacking contexts during animation or transforms.

The heatmap's amount formatter prefixes an ISO code and its components do not receive the statistics currency. Parsing retries create new revisions that inherit evidence, then execute the current revision processor. That processor currently builds a parse input with empty settings even though the parser supports `aiCustomPrompt`. The refresh coordinator polls only when it considers itself leader, contradicting its intended fallback behavior after failed leadership acquisition.

## Decisions

### Card Status Surface

**Choice:** Remove `SourceDocumentCardStatePanel` entirely. Render every non-completed source-document state once in the header's right-side status affordance. Keep candidate acceptance, abandonment, direct retry, and edit-retry in the existing overflow menu; detailed candidate comparison remains in the document detail view.

**Rationale:** A single status location produces consistent cards and avoids duplicate wording, controls, and card extensions while preserving available actions.

### Header Stacking

**Choice:** Establish an explicit application-layer hierarchy in which the sticky header is above ordinary stream content. Retain higher layers only for intentionally floating primitives such as popovers, dialogs, and tooltips.

**Rationale:** Scrolling card icons must never cover the navigation header, while interactive overlays must remain usable.

### Image Removal Control

**Choice:** Replace the textual red `x` overlay with a compact, icon-only destructive control sized consistently with other image-preview controls, including an accessible label and hover/focus treatment.

**Rationale:** The control remains discoverable without obscuring the image.

### Heatmap Currency Display

**Choice:** Pass the statistics currency through the heatmap component tree and format values with `Intl.NumberFormat` currency display using localized symbols. When the runtime cannot render the currency, fall back to the ISO code.

**Rationale:** Symbols are compact while locale-aware formatting disambiguates common currencies where necessary.

### Prompt Assembly and Retry Semantics

**Choice:** Load the active ledger parsing settings at processing time and pass the saved custom prompt into the parser. Both direct retry and edited retry retain their current evidence semantics and reassemble the parser prompt from the current system prompt and current ledger settings when their queued revision runs.

**Rationale:** Prompt configuration should take effect immediately for new processing attempts and must not be silently lost in the production processing path.

### Refresh Fallback

**Choice:** When leader election cannot be acquired, a visible, online tab performs the same bounded single-flight refresh cycle independently. Cross-tab leader mode remains preferred when it is available.

**Rationale:** Refresh must continue in privacy-restricted or storage-failing browser environments without sacrificing normal cross-tab coordination.

## Design

The stream card will compose only its header and expandable content. Its header status mapper will cover queued, processing, candidate-pending, anomaly, and failure states. Existing menu permissions continue to determine which recovery and candidate actions are available.

The stacking fix will be token-based and applied to the sticky header/normal content boundary, avoiding broad arbitrary `z-index` values. Image removal will use the existing Lucide icon library and stable dimensions.

Heatmap components will accept the resolved stats currency and UI locale, delegate compact number formatting to the shared heatmap formatter, and use the browser's currency formatter for symbol placement.

The revision processor will retrieve ledger settings together with the current processing context, then construct the parser input from those current values. The coordinator's request guard will permit execution when it is either leader or in fallback mode; it will preserve visibility, online, timer, and single-flight guards.

## Interfaces and Data Flow

- `StatsTab` supplies the resolved statistics currency to `CalendarHeatmapSection`, then through adaptive large/small grid cells to the formatter.
- Ledger metadata settings flow from the current revision processor to `runParsePipeline`, `buildParserInput`, and the parser's `Additional Instructions` section.
- Retried revisions inherit or replace evidence as they do today; they do not persist a prompt snapshot.
- `RefreshCoordinator` elects a leader when possible; otherwise each eligible subscribed tab may issue its bounded refresh callback.

## Errors and Edge Cases

- A currency unsupported by `Intl.NumberFormat` displays the ISO code rather than failing heatmap rendering.
- Empty custom prompts remain omitted from the parser prompt.
- A custom prompt changed after a retry is queued but before its task runs is read as the current value at task execution.
- Hidden or offline tabs do not poll in either leader or fallback mode.
- A failed refresh uses the existing bounded exponential backoff.

## Compatibility and Rollout

No data migration is required. Existing source documents, revisions, retry actions, prompt settings, and API contracts remain compatible. The removed state-panel component and its focused tests are retired with the UI surface.

## Acceptance Criteria

- Each non-completed stream card shows its state once in the header; no state panel appears below the header.
- Candidate and retry actions remain available through the overflow menu according to supported actions.
- Scrolling content cannot appear above the sticky application header; menus, dialogs, and tooltips continue to layer correctly.
- The image removal button is compact and accessible, and it does not cover a substantial portion of its image.
- Heatmap cells and tooltips use localized currency symbols for the active statistics currency, with an ISO fallback.
- A saved custom ledger prompt appears in the actual parser request created by the current revision processor.
- Direct and edited retries use the system prompt and custom ledger prompt current at task execution.
- Polling proceeds in visible, online tabs when leader election fails, and remains single-flight.

## Open Questions

None
