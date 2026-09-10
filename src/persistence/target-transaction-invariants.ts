/**
 * The database cannot make the source document revision pointers prove that a
 * revision belongs to that same document. Target write adapters must load the
 * referenced revisions in their transaction and call these checks before commit.
 */
export interface RevisionPointerFact {
  id: string;
  ledgerId: string;
  sourceDocumentId: string;
  processingStatus: "processing" | "completed" | "failed" | "cancelled" | null;
}

export function assertSourceDocumentRevisionPointers(input: {
  ledgerId: string;
  sourceDocumentId: string;
  activeRevision: RevisionPointerFact | null;
  latestSubmissionRevision: RevisionPointerFact | null;
}): void {
  const pointers = [input.activeRevision, input.latestSubmissionRevision].filter(
    (pointer): pointer is RevisionPointerFact => pointer != null
  );

  for (const pointer of pointers) {
    if (
      pointer.ledgerId !== input.ledgerId ||
      pointer.sourceDocumentId !== input.sourceDocumentId
    ) {
      throw new Error("Revision pointer must belong to the source document in the same ledger");
    }
  }

  if (
    input.activeRevision?.processingStatus !== "completed" &&
    input.activeRevision?.processingStatus !== null
  ) {
    if (input.activeRevision != null) {
      throw new Error("Active revision must be completed");
    }
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
    throw new Error(
      "Ledger projection revision must belong to the entry source document and ledger"
    );
  }
}
