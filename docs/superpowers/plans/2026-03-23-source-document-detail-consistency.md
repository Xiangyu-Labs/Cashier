# Source Document Detail Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the source-document detail surface internally consistent by stabilizing the light/detail/retry contract, preventing false-success close behavior, deriving totals from one edited view model, and synchronizing detail/light/list caches.

**Architecture:** Keep the entire source-document detail surface under one workstream. Normalize the light DTO so the detail and retry UI stop compensating for missing fields, pull edited display math into a pure helper, and make all optimistic cache helpers patch the same three query families together.

**Tech Stack:** React 19, TypeScript, TanStack Query, Next Intl, Vitest DOM/unit tests

---

## File Map

- Modify: `src/modules/source-document/application/queries/get-source-document-light.ts` - return a stable light DTO shape that the detail/retry UI can consume directly.
- Modify: `src/modules/source-document/hooks/useSourceDocumentDetailData.ts` - remove compensating `safe*` object repair and rely on the normalized DTO.
- Create: `src/modules/source-document/ui/source-document-retry-seed.ts` - pure helper for retry dialog initial data.
- Modify: `src/modules/source-document/ui/SourceDocumentEditRetryDialog.tsx` - stop over-fetching full data when the light DTO already contains the needed retry payload.
- Modify: `src/modules/source-document/ui/SourceDocumentDetailModal.tsx` - only close after an actual successful save.
- Create: `src/modules/source-document/ui/source-document-detail-view-model.ts` - one edited display model for subtotals and main-currency totals.
- Modify: `src/modules/source-document/ui/SourceDocumentViewDetails.tsx` - consume the new view-model helper.
- Modify: `src/modules/source-document/hooks/source-document-detail-cache.ts` - update detail, light, and collection caches together.
- Create: `tests/unit/modules/source-document/hooks/useSourceDocumentDetailData.test.ts`
- Create: `tests/unit/modules/source-document/ui/SourceDocumentEditRetryDialog.test.tsx`
- Create: `tests/unit/modules/source-document/ui/SourceDocumentDetailModal.test.tsx`
- Create: `tests/unit/modules/source-document/ui/source-document-detail-view-model.test.ts`
- Create: `tests/unit/modules/source-document/hooks/source-document-detail-cache.test.ts`
- Modify: `tests/unit/source-document/hooks/useSourceDocumentEntryMutations.test.ts`

### Task 1: Normalize the light/detail/retry contract

**Files:**
- Modify: `src/modules/source-document/application/queries/get-source-document-light.ts`
- Modify: `src/modules/source-document/hooks/useSourceDocumentDetailData.ts`
- Create: `src/modules/source-document/ui/source-document-retry-seed.ts`
- Modify: `src/modules/source-document/ui/SourceDocumentEditRetryDialog.tsx`
- Create: `tests/unit/modules/source-document/hooks/useSourceDocumentDetailData.test.ts`
- Create: `tests/unit/modules/source-document/ui/SourceDocumentEditRetryDialog.test.tsx`

- [ ] **Step 1: Write the failing tests**

```ts
it("keeps light detail data directly usable without safe fallback objects", () => {
  useQueryMock
    .mockReturnValueOnce({
      data: {
        id: "doc-1",
        ledgerId: "ledger-1",
        imageUrls: ["/api/uploads/ledger-1/doc-1/a.jpg"],
        hasImages: true,
        ledgerEntries: [{ id: "entry-1" }],
        status: "completed",
        type: "ai_parsed",
      },
      isLoading: false,
    })
    .mockReturnValueOnce({ data: null, error: null });

  const { result } = renderHook(() =>
    useSourceDocumentDetailData({
      ledgerId: "ledger-1",
      id: "doc-1",
      open: true,
    })
  );

  expect(result.current.sourceDocument?.imageUrls).toEqual([
    "/api/uploads/ledger-1/doc-1/a.jpg",
  ]);
  expect(result.current.currentLedgerEntries).toEqual([{ id: "entry-1" }]);
  expect(result.current.isLoadingImages).toBe(false);
});

it("does not fetch full retry data when the light DTO already contains text and imageUrls", () => {
  render(
    <SourceDocumentEditRetryDialog
      ledgerId="ledger-1"
      open
      onOpenChange={vi.fn()}
      sourceDocument={{
        id: "doc-1",
        text: "Receipt text",
        imageUrls: ["/api/uploads/ledger-1/doc-1/a.jpg"],
        hasImages: true,
        entryDate: "2026-03-20",
        ledgerEntries: [],
        status: "completed",
        type: "ai_parsed",
      }}
    />
  );

  expect(getSourceDocumentFullActionMock).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:unit -- tests/unit/modules/source-document/hooks/useSourceDocumentDetailData.test.ts tests/unit/modules/source-document/ui/SourceDocumentEditRetryDialog.test.tsx`

Expected: FAIL because `getSourceDocumentLight()` still strips fields and the retry dialog still treats too many shapes as incomplete.

- [ ] **Step 3: Write the minimal implementation**

```ts
// get-source-document-light.ts
return {
  ...serializeSourceDocument(document, {
    stripMetadataFields: ["visionDescription", "originalImageUrls"],
    includeHasImages: true,
    ledgerEntries: entriesByDocId.get(document.id) ?? [],
  }),
  hasImages: accessContext.hasImages,
};

// useSourceDocumentDetailData.ts
const sourceDocument = fullData ?? lightData ?? null;
const currentLedgerEntries = sourceDocument?.ledgerEntries ?? initialLedgerEntries ?? [];
const isLoadingImages =
  sourceDocument != null &&
  sourceDocument.hasImages === true &&
  (sourceDocument.imageUrls?.length ?? 0) === 0;

return {
  sourceDocument,
  currentLedgerEntries,
  ledgerId: sourceDocument?.ledgerId ?? ledgerId,
  isLoading,
  isLoadingImages,
  error,
};

// source-document-retry-seed.ts
export function buildSourceDocumentRetrySeed(sourceDocument: RetrySeedSourceDocument, fullData?: RetrySeedFullData) {
  const imageUrls = fullData?.imageUrls ?? sourceDocument.imageUrls ?? [];
  const text = fullData?.text ?? sourceDocument.text ?? undefined;

  return {
    images: imageUrls.map((url) => ({ data: url, mimeType: "image/jpeg" })),
    ...(text != null ? { text } : {}),
    ...(sourceDocument.entryDate != null ? { entryDate: sourceDocument.entryDate } : {}),
  };
}
```

Implementation notes:

- Remove `safeSourceDocument` and `safeLedgerId` from the hook API once consumers are updated.
- Keep the dialog prop on one stable source-document shape instead of a union with `{ id: string }`.
- Do not add a second fallback fetch path anywhere else in the UI.

- [ ] **Step 4: Run the targeted tests**

Run: `npm run test:unit -- tests/unit/modules/source-document/hooks/useSourceDocumentDetailData.test.ts tests/unit/modules/source-document/ui/SourceDocumentEditRetryDialog.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/source-document/application/queries/get-source-document-light.ts src/modules/source-document/hooks/useSourceDocumentDetailData.ts src/modules/source-document/ui/source-document-retry-seed.ts src/modules/source-document/ui/SourceDocumentEditRetryDialog.tsx tests/unit/modules/source-document/hooks/useSourceDocumentDetailData.test.ts tests/unit/modules/source-document/ui/SourceDocumentEditRetryDialog.test.tsx
git commit -m "refactor: stabilize source document detail contract"
```

### Task 2: Keep the modal open when save-and-close fails

**Files:**
- Modify: `src/modules/source-document/ui/SourceDocumentDetailModal.tsx`
- Create: `tests/unit/modules/source-document/ui/SourceDocumentDetailModal.test.tsx`

- [ ] **Step 1: Write the failing DOM test**

```tsx
it("does not close the modal when save-and-close fails", async () => {
  const user = userEvent.setup();
  const onClose = vi.fn();
  const onUpdateEntry = vi.fn().mockRejectedValueOnce(new Error("save failed"));

  render(
    <SourceDocumentDetailModal
      ledgerId="ledger-1"
      open
      onClose={onClose}
      sourceDocument={buildSourceDocument()}
      ledgerEntries={[buildLedgerEntry()]}
      categories={[]}
      onUpdateSourceDoc={vi.fn().mockResolvedValue(undefined)}
      onUpdateImages={vi.fn().mockResolvedValue(undefined)}
      onUpdateEntry={onUpdateEntry}
      onBatchUpdate={vi.fn().mockResolvedValue(undefined)}
      onDeleteEntry={vi.fn().mockResolvedValue(undefined)}
    />
  );

  await user.clear(screen.getByDisplayValue("Coffee"));
  await user.type(screen.getByRole("textbox"), "Coffee beans");
  fireEvent.keyDown(document, { key: "Escape" });
  await user.click(await screen.findByRole("button", { name: "save" }));

  expect(onClose).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:unit -- tests/unit/modules/source-document/ui/SourceDocumentDetailModal.test.tsx`

Expected: FAIL because `handleSaveAllAndClose()` currently closes after a caught save error.

- [ ] **Step 3: Write the minimal implementation**

```ts
const handleSaveAll = useCallback(async (): Promise<boolean> => {
  setIsSaving(true);
  try {
    ...
    discardAllChanges();
    toast.success(t("saveAllSuccess", { count: pendingChangesCount }));
    return true;
  } catch (error) {
    console.error("Failed to save changes:", error);
    toast.error(t("saveAllError"));
    return false;
  } finally {
    setIsSaving(false);
  }
}, [...]);

const handleSaveAllAndClose = useCallback(async () => {
  const saved = await handleSaveAll();
  if (!saved) return;

  setShowUnsavedConfirm(false);
  onClose();
}, [handleSaveAll, onClose]);
```

- [ ] **Step 4: Run the targeted test**

Run: `npm run test:unit -- tests/unit/modules/source-document/ui/SourceDocumentDetailModal.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/source-document/ui/SourceDocumentDetailModal.tsx tests/unit/modules/source-document/ui/SourceDocumentDetailModal.test.tsx
git commit -m "fix: keep source document detail open on save failure"
```

### Task 3: Derive edited totals from one display model

**Files:**
- Create: `src/modules/source-document/ui/source-document-detail-view-model.ts`
- Modify: `src/modules/source-document/ui/SourceDocumentViewDetails.tsx`
- Create: `tests/unit/modules/source-document/ui/source-document-detail-view-model.test.ts`

- [ ] **Step 1: Write the failing pure-helper test**

```ts
it("uses the same edited entry model for subtotals and main-currency total", () => {
  const result = buildSourceDocumentDetailViewModel({
    ledgerEntries: [
      {
        id: "entry-1",
        amount: "10.00",
        currency: "USD",
        convertedAmount: "72.00",
        exchangeRate: "7.2",
      },
    ] as LedgerEntry[],
    pendingChanges: {
      sourceDoc: {},
      entries: {
        "entry-1": {
          amount: "20.00",
        },
      },
    },
    mainCurrency: "CNY",
  });

  expect(result.subtotalsByCurrency).toEqual({ USD: 20 });
  expect(result.totalInMainCurrency).toBe(144);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:unit -- tests/unit/modules/source-document/ui/source-document-detail-view-model.test.ts`

Expected: FAIL because the current UI computes edited subtotals and stale converted totals from different sources.

- [ ] **Step 3: Write the minimal implementation**

```ts
export function buildSourceDocumentDetailViewModel({
  ledgerEntries,
  pendingChanges,
  mainCurrency,
}: BuildSourceDocumentDetailViewModelInput) {
  const displayEntries = ledgerEntries.map((entry) => {
    const change = pendingChanges.entries[entry.id] ?? {};
    const currency = change.currency ?? entry.currency ?? mainCurrency;
    const amount = parseAmount(change.amount ?? entry.amount);
    const exchangeRate =
      entry.exchangeRate != null && entry.exchangeRate !== ""
        ? Number.parseFloat(entry.exchangeRate)
        : null;

    const convertedAmount =
      currency === mainCurrency
        ? amount
        : exchangeRate != null
          ? Number((amount * exchangeRate).toFixed(2))
          : entry.convertedAmount != null &&
              entry.convertedAmount !== "" &&
              change.amount === undefined &&
              change.currency === undefined
            ? parseAmount(entry.convertedAmount)
            : null;

    return {
      ...entry,
      amount,
      currency,
      convertedAmount,
    };
  });

  ...
}
```

Then wire `SourceDocumentViewDetails.tsx` to:

- compute `displayEntries`, `subtotalsByCurrency`, and `totalInMainCurrency` from the helper
- pass `displayEntries` into the breakdown component
- remove duplicated inline subtotal/total math

- [ ] **Step 4: Run the targeted tests**

Run: `npm run test:unit -- tests/unit/modules/source-document/ui/source-document-detail-view-model.test.ts tests/unit/modules/source-document/ui/SourceDocumentDetailModal.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/source-document/ui/source-document-detail-view-model.ts src/modules/source-document/ui/SourceDocumentViewDetails.tsx tests/unit/modules/source-document/ui/source-document-detail-view-model.test.ts
git commit -m "fix: unify source document detail totals"
```

### Task 4: Keep detail, light, and list caches synchronized

**Files:**
- Modify: `src/modules/source-document/hooks/source-document-detail-cache.ts`
- Create: `tests/unit/modules/source-document/hooks/source-document-detail-cache.test.ts`

- [ ] **Step 1: Write the failing cache-helper test**

```ts
it("updates sourceDocumentLight caches alongside detail and collection caches", () => {
  const queryClient = new QueryClient();

  queryClient.setQueryData(queryKeys.sourceDocument("doc-1"), buildDetailDoc());
  queryClient.setQueryData(queryKeys.sourceDocumentLight("doc-1"), buildLightDoc());
  queryClient.setQueryData(queryKeys.sourceDocumentCollection("ledger-1", { limit: 1000 }), {
    items: [buildCollectionDoc()],
    hasMore: false,
    total: 1,
  });

  updateSingleEntryInCaches(queryClient, "doc-1", "ledger-1", "entry-1", {
    itemName: "Updated",
  });

  expect(
    queryClient.getQueryData<SourceDocumentLightWithEntriesDto>(queryKeys.sourceDocumentLight("doc-1"))
      ?.ledgerEntries?.[0]?.itemName
  ).toBe("Updated");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:unit -- tests/unit/modules/source-document/hooks/source-document-detail-cache.test.ts`

Expected: FAIL because the helper currently patches `sourceDocument()` and collection queries only.

- [ ] **Step 3: Write the minimal implementation**

```ts
function updateLightDocumentEntries(
  queryClient: QueryClient,
  documentId: string,
  updater: (
    entries: SourceDocumentLightQueryData["ledgerEntries"]
  ) => SourceDocumentLightQueryData["ledgerEntries"]
) {
  queryClient.setQueriesData(
    { queryKey: queryKeys.sourceDocumentLight(documentId) },
    (old: SourceDocumentLightQueryData | undefined) => {
      if (!old?.ledgerEntries) return old;
      return {
        ...old,
        ledgerEntries: updater(old.ledgerEntries),
      };
    }
  );
}

export function updateSingleEntryInCaches(...) {
  ...
  updateLightDocumentEntries(queryClient, documentId, (entries) =>
    entries.map((entry) => (entry.id === entryId ? { ...entry, ...data } : entry))
  );
}
```

Apply the same pattern to `updateBatchEntriesInCaches()`, `removeSingleEntryFromCaches()`, and `removeBatchEntriesFromCaches()`.

- [ ] **Step 4: Run the targeted tests**

Run: `npm run test:unit -- tests/unit/modules/source-document/hooks/source-document-detail-cache.test.ts tests/unit/source-document/hooks/useSourceDocumentEntryMutations.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/source-document/hooks/source-document-detail-cache.ts tests/unit/modules/source-document/hooks/source-document-detail-cache.test.ts tests/unit/source-document/hooks/useSourceDocumentEntryMutations.test.ts
git commit -m "fix: sync source document light caches"
```
