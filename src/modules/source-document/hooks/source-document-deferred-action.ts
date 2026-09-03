export type SourceDocumentDeferredAction =
  | { type: "accept-candidate" }
  | { type: "abandon-candidate" }
  | { type: "cancel-processing" }
  | { type: "open-retry" }
  | { type: "open-delete" }
  | { type: "open-add" }
  | { type: "open-split" }
  | { type: "request-entry-delete"; entryId: string }
  | { type: "batch-delete" }
  | { type: "batch-category"; categoryId: string | null }
  | { type: "batch-currency"; currency: string };

export function sourceDocumentDeferredContextKey(input: {
  sourceDocumentId: string | null | undefined;
  activeRevisionId: string | null | undefined;
  pendingRevisionId: string | null | undefined;
  entryIds: readonly string[];
  selectedIds: readonly string[];
}): string {
  return JSON.stringify({
    sourceDocumentId: input.sourceDocumentId ?? null,
    activeRevisionId: input.activeRevisionId ?? null,
    pendingRevisionId: input.pendingRevisionId ?? null,
    entryIds: [...input.entryIds].sort(),
    selectedIds: [...input.selectedIds].sort(),
  });
}
