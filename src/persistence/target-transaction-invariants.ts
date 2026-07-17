/**
 * The database cannot make the source_documents active/pending pointer prove that a
 * revision belongs to that same document. Target write adapters must load the
 * referenced revisions in their transaction and call these checks before commit.
 */
export interface RevisionPointerFact {
  id: string;
  ledgerId: string;
  sourceDocumentId: string;
  outcome: "queued" | "processing" | "completed" | "anomaly" | "failed";
}

export function assertSourceDocumentRevisionPointers(input: {
  ledgerId: string;
  sourceDocumentId: string;
  activeRevision: RevisionPointerFact | null;
  pendingRevision: RevisionPointerFact | null;
}): void {
  const pointers = [input.activeRevision, input.pendingRevision].filter(
    (pointer): pointer is RevisionPointerFact => pointer != null
  );

  for (const pointer of pointers) {
    if (pointer.ledgerId !== input.ledgerId || pointer.sourceDocumentId !== input.sourceDocumentId) {
      throw new Error("Revision pointer must belong to the source document in the same ledger");
    }
  }

  if (input.activeRevision?.outcome !== "completed") {
    if (input.activeRevision != null) {
      throw new Error("Active revision must be completed");
    }
  }

  if (input.pendingRevision?.outcome === "completed") {
    throw new Error("Pending revision cannot be completed");
  }

  if (input.activeRevision?.id === input.pendingRevision?.id) {
    throw new Error("Active and pending revisions must differ");
  }
}

export function assertLedgerProjectionRevision(input: {
  ledgerId: string;
  sourceDocumentId: string | null;
  revision: RevisionPointerFact;
}): void {
  if (
    input.revision.ledgerId !== input.ledgerId ||
    (input.sourceDocumentId != null && input.revision.sourceDocumentId !== input.sourceDocumentId)
  ) {
    throw new Error("Ledger projection revision must belong to the entry source document and ledger");
  }
}
