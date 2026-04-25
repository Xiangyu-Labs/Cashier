# SourceDocumentCard Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor `src/modules/source-document/ui/SourceDocumentCard.tsx` into small, card-local pieces so new card interactions can be added without dragging the whole file back into the change.

**Architecture:** Keep `SourceDocumentCard` as the exported shell and the only owner of expansion, retry, and selection state. Move derived data into tiny pure helpers and split the render tree into local subcomponents for header, totals, preview, and completed-entry rendering. Do not introduce a shared card framework or try to unify this with `SourceDocumentViewDetails` in the same PR.

**Tech Stack:** React 19, TypeScript, Next.js, next-intl, Framer Motion, Vitest, Testing Library

---

## Scope Check

This plan is intentionally limited to the `SourceDocumentCard` hotspot and its immediate caller:

- `src/modules/source-document/ui/SourceDocumentCard.tsx`
- `src/modules/workspace/ui/LedgerEntriesCompletedGroups.tsx`

It does **not** refactor `SourceDocumentViewDetails`, `LedgerEntryItem`, or any task-queue card abstractions. If later we want to share totals or sorting helpers across detail views, that should be a follow-up plan after this card split lands cleanly.

## File Map

- `src/modules/source-document/ui/SourceDocumentCard.tsx`
  - Final shell. Owns public export, `defaultExpanded` state, retry loading state, selection/detail click routing, and the `AnimatePresence` wrapper.
- `src/modules/source-document/ui/source-document-card.types.ts`
  - New card-local types for preview payload and currency breakdown data. Keep these local; do not promote them to shared contracts.
- `src/modules/source-document/ui/source-document-card.utils.ts`
  - New pure helpers for preview extraction, safe image URL normalization, entry sorting, and totals/breakdown derivation.
- `src/modules/source-document/ui/SourceDocumentCardTotal.tsx`
  - New presentational total + currency breakdown popover.
- `src/modules/source-document/ui/SourceDocumentCardHeader.tsx`
  - New header component. Owns selection checkbox, expand button, date/title/manual badge, status display, total slot, and retry/delete menu.
- `src/modules/source-document/ui/SourceDocumentCardPreview.tsx`
  - New preview component for non-completed documents. Owns image grid and raw text block only.
- `src/modules/source-document/ui/SourceDocumentCardEntries.tsx`
  - New completed-state entries list component. Owns `LedgerEntryItem` mapping only.
- `src/modules/workspace/ui/LedgerEntriesCompletedGroups.tsx`
  - Update prop passing if `SourceDocumentCard` dead props are removed.
- `tests/unit/modules/source-document/ui/SourceDocumentCard.test.tsx`
  - New direct behavior tests for click routing, expand/collapse, retry/delete interactions, preview rendering, and completed-entry rendering.
- `tests/unit/modules/source-document/source-document-card.utils.test.ts`
  - New pure helper tests for sorting, preview extraction, image normalization, and currency totals.
- `tests/unit/modules/source-document/source-document-card-other.test.tsx`
  - Existing warning-variant guardrail; keep it green after the extraction.

## Design Constraints

- Preserve the public export name: `SourceDocumentCard`.
- Preserve current user-visible behavior:
  - selection mode makes the whole card toggle selection
  - normal mode allows header/preview to open details
  - retry remains async with a loading state
  - delete remains available from the dropdown
  - expand/collapse animation stays on the shell
  - completed cards render sorted ledger entries
  - non-completed cards render preview images/text
- Keep the split card-local. No shared `CardBase`, no global view-model layer, no reducer added just to reorganize JSX.
- Remove dead props only after tests prove the current visible behavior is locked.

### Task 1: Lock The Current Card Contract With Direct Tests

**Files:**
- Create: `tests/unit/modules/source-document/ui/SourceDocumentCard.test.tsx`
- Test: `tests/unit/modules/source-document/source-document-card-other.test.tsx`

- [ ] **Step 1: Write the failing direct card tests**

Create a new direct test file with lightweight mocks for `next/image`, `framer-motion`, and `next-intl`.

Start with behaviors that define the public contract:

```tsx
it("routes clicks to details in normal mode and selection in selection mode", async () => {
  const user = userEvent.setup();
  const onViewDetails = vi.fn();
  const onToggleSelect = vi.fn();

  const { rerender } = render(
    <SourceDocumentCard
      sourceDocument={createSourceDocument()}
      ledgerEntries={createEntries()}
      mainCurrency="CNY"
      status="completed"
      onViewDetails={onViewDetails}
      defaultExpanded
    />
  );

  await user.click(screen.getByText("测试单据"));
  expect(onViewDetails).toHaveBeenCalledTimes(1);

  rerender(
    <SourceDocumentCard
      sourceDocument={createSourceDocument()}
      ledgerEntries={createEntries()}
      mainCurrency="CNY"
      status="completed"
      selectionMode
      isSelected={false}
      onToggleSelect={onToggleSelect}
      onViewDetails={onViewDetails}
      defaultExpanded
    />
  );

  await user.click(screen.getByTestId("source-document-card-root"));
  expect(onToggleSelect).toHaveBeenCalledTimes(1);
  expect(onViewDetails).toHaveBeenCalledTimes(1);
});
```

Add at least these assertions in the same file:

- completed cards render entries in category `sortOrder` order, then by amount descending
- non-completed cards render image/text preview instead of `LedgerEntryItem`
- the expand button toggles body visibility without triggering details

- [ ] **Step 2: Run the new direct card tests and confirm they fail**

Run: `npm run test:unit -- tests/unit/modules/source-document/ui/SourceDocumentCard.test.tsx`
Expected: FAIL because the card currently lacks stable selectors and the new contract is not covered directly.

- [ ] **Step 3: Add the smallest test seams required for stable coverage**

Allowed additions inside `SourceDocumentCard.tsx`:

- `data-testid="source-document-card-root"` on the outer card wrapper
- a stable label or `data-testid` for the expanded content wrapper if animation timing makes visibility assertions flaky
- a stable label on the menu trigger if the icon-only button cannot be queried accessibly in tests

Do not change user-visible behavior just to satisfy the tests.

- [ ] **Step 4: Re-run the direct card tests**

Run: `npm run test:unit -- tests/unit/modules/source-document/ui/SourceDocumentCard.test.tsx`
Expected: PASS

- [ ] **Step 5: Re-run the existing warning-variant guardrail**

Run: `npm run test:unit -- tests/unit/modules/source-document/source-document-card-other.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add tests/unit/modules/source-document/ui/SourceDocumentCard.test.tsx \
  tests/unit/modules/source-document/source-document-card-other.test.tsx \
  src/modules/source-document/ui/SourceDocumentCard.tsx
git commit -m "test: lock source document card behavior"
```

### Task 2: Extract Pure Card Types And Helpers

**Files:**
- Create: `src/modules/source-document/ui/source-document-card.types.ts`
- Create: `src/modules/source-document/ui/source-document-card.utils.ts`
- Create: `tests/unit/modules/source-document/source-document-card.utils.test.ts`
- Modify: `src/modules/source-document/ui/SourceDocumentCard.tsx`

- [ ] **Step 1: Write the failing helper tests**

Create a dedicated utility test file so sorting and totals logic can be exercised without rendering React.

Cover at least these pure functions:

```ts
import {
  buildSourceDocumentCardTotals,
  getSafeImageSrc,
  getSourceDocumentPreview,
  sortSourceDocumentEntries,
} from "@/modules/source-document/ui/source-document-card.utils";

it("sorts entries by category sortOrder and then amount descending", () => {
  const [first, second, third] = sortSourceDocumentEntries([
    createEntry({ id: "b", amount: "12.00", category: { sortOrder: 3 } }),
    createEntry({ id: "a", amount: "88.00", category: { sortOrder: 1 } }),
    createEntry({ id: "c", amount: "50.00", category: { sortOrder: 1 } }),
  ]);

  expect([first.id, second.id, third.id]).toEqual(["a", "c", "b"]);
});

it("normalizes preview text and image arrays from a source document", () => {
  expect(getSourceDocumentPreview(createSourceDocument({ text: null, imageUrls: undefined }))).toEqual({
    text: "",
    images: [],
  });
});
```

Add one currency-total test that proves converted totals still fall back to the entry amount when the entry currency already equals `mainCurrency`.

- [ ] **Step 2: Run the helper tests and confirm missing-module failure**

Run: `npm run test:unit -- tests/unit/modules/source-document/source-document-card.utils.test.ts`
Expected: FAIL because the new type/helper modules do not exist yet.

- [ ] **Step 3: Create the card-local types and helper functions**

Add a tiny local types file like:

```ts
export interface SourceDocumentCardPreviewData {
  text: string;
  images: string[];
}

export interface SourceDocumentCardCurrencyBreakdown {
  currency: string;
  amount: number;
  convertedAmount?: number;
}

export interface SourceDocumentCardTotals {
  subtotalsByCurrency: Record<string, number>;
  totalInMainCurrency: number;
  breakdownData: SourceDocumentCardCurrencyBreakdown[];
}
```

Implement the matching helper module with functions like:

- `getSafeImageSrc(data: string)`
- `getSourceDocumentPreview(sourceDocument)`
- `sortSourceDocumentEntries(entries)`
- `buildSourceDocumentCardTotals(entries, mainCurrency)`

Then update `SourceDocumentCard.tsx` to consume these helpers instead of inlining the logic.

- [ ] **Step 4: Re-run the helper and direct card tests**

Run: `npm run test:unit -- tests/unit/modules/source-document/source-document-card.utils.test.ts tests/unit/modules/source-document/ui/SourceDocumentCard.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/modules/source-document/ui/source-document-card.types.ts \
  src/modules/source-document/ui/source-document-card.utils.ts \
  src/modules/source-document/ui/SourceDocumentCard.tsx \
  tests/unit/modules/source-document/source-document-card.utils.test.ts \
  tests/unit/modules/source-document/ui/SourceDocumentCard.test.tsx
git commit -m "refactor: extract source document card helpers"
```

### Task 3: Extract The Header And Total Area

**Files:**
- Create: `src/modules/source-document/ui/SourceDocumentCardTotal.tsx`
- Create: `src/modules/source-document/ui/SourceDocumentCardHeader.tsx`
- Modify: `src/modules/source-document/ui/SourceDocumentCard.tsx`
- Test: `tests/unit/modules/source-document/ui/SourceDocumentCard.test.tsx`

- [ ] **Step 1: Add the failing header/action interaction tests**

Extend the direct card test file with assertions for header-owned behavior:

```tsx
it("shows retry loading state and delete action from the menu", async () => {
  const user = userEvent.setup();
  let resolveRetry: (() => void) | null = null;

  const onRetry = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        resolveRetry = resolve;
      })
  );
  const onDelete = vi.fn();

  render(
    <SourceDocumentCard
      sourceDocument={createSourceDocument({ type: "image" })}
      ledgerEntries={[]}
      mainCurrency="CNY"
      status="failed"
      onRetry={onRetry}
      onDelete={onDelete}
      defaultExpanded
    />
  );

  await user.click(screen.getByLabelText("source-document-card-actions"));
  await user.click(screen.getByText("retry"));
  expect(onRetry).toHaveBeenCalledTimes(1);
});
```

Also add assertions that:

- processing/anomaly/failed states show `ProcessingStatus` instead of the total
- multi-currency completed cards still show the total trigger and popover copy
- clicking the chevron only toggles expansion

- [ ] **Step 2: Run the direct card tests and confirm they fail**

Run: `npm run test:unit -- tests/unit/modules/source-document/ui/SourceDocumentCard.test.tsx`
Expected: FAIL until header responsibilities are separated and the menu/total area has stable wiring.

- [ ] **Step 3: Extract `SourceDocumentCardTotal` and `SourceDocumentCardHeader`**

Keep the extracted components presentational and card-local.

Use an explicit header interface similar to:

```tsx
interface SourceDocumentCardHeaderProps {
  sourceDocument: SourceDocument | SourceDocumentLight;
  status: SourceDocumentStatusType;
  anomalyReason?: string | null;
  ledgerEntries: LedgerEntry[];
  mainCurrency: string;
  isExpanded: boolean;
  isRetrying: boolean;
  selectionMode: boolean;
  isSelected: boolean;
  onToggleExpanded: () => void;
  onViewDetails?: () => void;
  onToggleSelect?: () => void;
  onRetry?: () => void | Promise<void>;
  onDelete?: () => void;
}
```

Important boundaries:

- `SourceDocumentCardHeader.tsx` owns all header-only conditionals: status badge visibility, title/date/manual badge display, dropdown item visibility, and total placement
- `SourceDocumentCardTotal.tsx` owns the popover markup only
- `SourceDocumentCard.tsx` keeps `isRetrying` state and passes handlers down

- [ ] **Step 4: Re-run the direct card tests**

Run: `npm run test:unit -- tests/unit/modules/source-document/ui/SourceDocumentCard.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/modules/source-document/ui/SourceDocumentCardTotal.tsx \
  src/modules/source-document/ui/SourceDocumentCardHeader.tsx \
  src/modules/source-document/ui/SourceDocumentCard.tsx \
  tests/unit/modules/source-document/ui/SourceDocumentCard.test.tsx
git commit -m "refactor: extract source document card header"
```

### Task 4: Extract Preview And Completed Entries Rendering

**Files:**
- Create: `src/modules/source-document/ui/SourceDocumentCardPreview.tsx`
- Create: `src/modules/source-document/ui/SourceDocumentCardEntries.tsx`
- Modify: `src/modules/source-document/ui/SourceDocumentCard.tsx`
- Test: `tests/unit/modules/source-document/ui/SourceDocumentCard.test.tsx`
- Test: `tests/unit/modules/source-document/source-document-card-other.test.tsx`

- [ ] **Step 1: Add failing tests for the expanded body split**

Extend the direct component test file with one preview case and one completed-entry case:

```tsx
it("renders preview images and raw text for non-completed cards", () => {
  render(
    <SourceDocumentCard
      sourceDocument={createSourceDocument({
        text: "OCR preview",
        imageUrls: ["base64-image"],
      })}
      ledgerEntries={[]}
      mainCurrency="CNY"
      status="processing"
      onViewDetails={vi.fn()}
      defaultExpanded
    />
  );

  expect(screen.getByText("OCR preview")).toBeTruthy();
  expect(screen.getAllByRole("img")).toHaveLength(1);
});

it("renders completed entries through the list component without changing warning variants", () => {
  render(
    <SourceDocumentCard
      sourceDocument={createSourceDocument()}
      ledgerEntries={[createLockedCategoryEntry()]}
      mainCurrency="CNY"
      status="completed"
      defaultExpanded
    />
  );

  expect(document.querySelector(".border-warning\\/20")).not.toBeNull();
});
```

- [ ] **Step 2: Run the card-focused tests and confirm they fail**

Run: `npm run test:unit -- tests/unit/modules/source-document/ui/SourceDocumentCard.test.tsx tests/unit/modules/source-document/source-document-card-other.test.tsx`
Expected: FAIL until the expanded body responsibilities move into dedicated components.

- [ ] **Step 3: Extract preview and entries list components**

Use these boundaries:

- `SourceDocumentCardPreview.tsx`
  - receives `{ text, images, onViewDetails }`
  - owns image-grid and raw-text markup only
- `SourceDocumentCardEntries.tsx`
  - receives `{ entries, mainCurrency, sourceDocumentEntryDate, onViewLedgerEntry }`
  - owns `LedgerEntryItem` mapping and warning variant selection only
- `SourceDocumentCard.tsx`
  - keeps the `AnimatePresence` / `motion.div` wrapper and chooses which child to render

Do not let either extracted component know about retry, selection mode, or header actions.

- [ ] **Step 4: Re-run the card and guardrail tests**

Run: `npm run test:unit -- tests/unit/modules/source-document/ui/SourceDocumentCard.test.tsx tests/unit/modules/source-document/source-document-card-other.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/modules/source-document/ui/SourceDocumentCardPreview.tsx \
  src/modules/source-document/ui/SourceDocumentCardEntries.tsx \
  src/modules/source-document/ui/SourceDocumentCard.tsx \
  tests/unit/modules/source-document/ui/SourceDocumentCard.test.tsx \
  tests/unit/modules/source-document/source-document-card-other.test.tsx
git commit -m "refactor: extract source document card body"
```

### Task 5: Shrink The Public Prop Surface And Re-verify Consumers

**Files:**
- Modify: `src/modules/source-document/ui/SourceDocumentCard.tsx`
- Modify: `src/modules/workspace/ui/LedgerEntriesCompletedGroups.tsx`
- Modify: `tests/unit/modules/source-document/ui/SourceDocumentCard.test.tsx`
- Modify: `tests/unit/modules/source-document/source-document-card-other.test.tsx`

- [ ] **Step 1: Write the failing prop-surface cleanup expectations**

Start by deleting the dead props from `SourceDocumentCardProps` and use type-checking to find every remaining call site.

The props currently unused inside `SourceDocumentCard` are:

- `categories`
- `onUpdateLedgerEntry`
- `onDeleteLedgerEntry`

This task is not complete until the card no longer needs dummy `_`, `__`, `___` parameter bindings.

- [ ] **Step 2: Run type-checking and confirm the remaining call sites fail**

Run: `npx tsc --noEmit`
Expected: FAIL because `LedgerEntriesCompletedGroups.tsx` and the existing card tests still pass the removed props.

- [ ] **Step 3: Remove the dead props and update the caller/tests**

Update `SourceDocumentCardProps` to the smaller surface:

```ts
interface SourceDocumentCardProps {
  sourceDocument: SourceDocument | SourceDocumentLight;
  ledgerEntries: LedgerEntry[];
  mainCurrency?: string;
  onDelete?: () => void;
  onViewLedgerEntry?: (ledgerEntry: LedgerEntry) => void;
  onViewDetails?: () => void;
  defaultExpanded?: boolean;
  onRetry?: () => void | Promise<void>;
  status: SourceDocumentStatusType;
  anomalyReason?: string | null;
  className?: string;
  selectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: () => void;
}
```

Then:

- remove the dead prop passing from `LedgerEntriesCompletedGroups.tsx`
- update the direct card test factory
- update `tests/unit/modules/source-document/source-document-card-other.test.tsx`

- [ ] **Step 4: Run the focused verification suite**

Run: `npm run test:unit -- tests/unit/modules/source-document/ui/SourceDocumentCard.test.tsx tests/unit/modules/source-document/source-document-card.utils.test.ts tests/unit/modules/source-document/source-document-card-other.test.tsx`
Expected: PASS

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Run lint on the touched files**

Run: `npm run lint -- src/modules/source-document/ui/SourceDocumentCard.tsx src/modules/source-document/ui/SourceDocumentCardHeader.tsx src/modules/source-document/ui/SourceDocumentCardTotal.tsx src/modules/source-document/ui/SourceDocumentCardPreview.tsx src/modules/source-document/ui/SourceDocumentCardEntries.tsx src/modules/source-document/ui/source-document-card.types.ts src/modules/source-document/ui/source-document-card.utils.ts src/modules/workspace/ui/LedgerEntriesCompletedGroups.tsx tests/unit/modules/source-document/ui/SourceDocumentCard.test.tsx tests/unit/modules/source-document/source-document-card.utils.test.ts tests/unit/modules/source-document/source-document-card-other.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/modules/source-document/ui/SourceDocumentCard.tsx \
  src/modules/source-document/ui/SourceDocumentCardHeader.tsx \
  src/modules/source-document/ui/SourceDocumentCardTotal.tsx \
  src/modules/source-document/ui/SourceDocumentCardPreview.tsx \
  src/modules/source-document/ui/SourceDocumentCardEntries.tsx \
  src/modules/source-document/ui/source-document-card.types.ts \
  src/modules/source-document/ui/source-document-card.utils.ts \
  src/modules/workspace/ui/LedgerEntriesCompletedGroups.tsx \
  tests/unit/modules/source-document/ui/SourceDocumentCard.test.tsx \
  tests/unit/modules/source-document/source-document-card.utils.test.ts \
  tests/unit/modules/source-document/source-document-card-other.test.tsx
git commit -m "refactor: split source document card responsibilities"
```

## Final Verification

- Run: `npm run test:unit -- tests/unit/modules/source-document/ui/SourceDocumentCard.test.tsx tests/unit/modules/source-document/source-document-card.utils.test.ts tests/unit/modules/source-document/source-document-card-other.test.tsx`
  Expected: PASS
- Run: `npx tsc --noEmit`
  Expected: PASS
- Run: `npm run lint -- src/modules/source-document/ui/SourceDocumentCard.tsx src/modules/source-document/ui/SourceDocumentCardHeader.tsx src/modules/source-document/ui/SourceDocumentCardTotal.tsx src/modules/source-document/ui/SourceDocumentCardPreview.tsx src/modules/source-document/ui/SourceDocumentCardEntries.tsx src/modules/source-document/ui/source-document-card.types.ts src/modules/source-document/ui/source-document-card.utils.ts src/modules/workspace/ui/LedgerEntriesCompletedGroups.tsx tests/unit/modules/source-document/ui/SourceDocumentCard.test.tsx tests/unit/modules/source-document/source-document-card.utils.test.ts tests/unit/modules/source-document/source-document-card-other.test.tsx`
  Expected: PASS
- Run: `npm run check`
  Expected: PASS if you want a full-repo confidence pass before merge. This is recommended before the final merge commit, but it can wait until the task batch is done.

## Notes For The Implementer

- Prefer small presentational components with explicit props over hidden cross-file state.
- Keep `SourceDocumentCard.tsx` boring after the refactor: state at the top, derived data from helpers, header/body composition below.
- If a later refactor wants to share totals or sorting logic with `SourceDocumentViewDetails.tsx`, do that in a separate follow-up after this card split is stable.
