import { ConflictError, NotFoundError } from "@/lib/errors";
import type { SplitSourceDocumentInput } from "../../contracts";
import type { SourceDocumentReadPort, SourceDocumentAggregateWritePort } from "../ports";

export async function splitSourceDocument(
  ledgerId: string,
  input: SplitSourceDocumentInput,
  ports: {
    documents: Pick<SourceDocumentReadPort, "get">;
    updates: Pick<SourceDocumentAggregateWritePort, "splitEntries">;
  }
) {
  const sourceDocument = await ports.documents.get(ledgerId, input.sourceDocumentId);
  if (sourceDocument == null) throw new NotFoundError("Source document");
  if (!sourceDocument.supportedActions.includes("split_entries")) {
    throw new ConflictError("Source document cannot be split in its current state");
  }
  return ports.updates.splitEntries({ ledgerId, ...input });
}
