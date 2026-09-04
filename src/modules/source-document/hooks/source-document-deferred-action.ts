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
