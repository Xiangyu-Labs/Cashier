import type { SaveSourceDocumentChangesInput } from "../../contracts";
import type { SourceDocumentUpdatePort } from "../ports";

export function saveSourceDocumentChanges(
  ledgerId: string,
  input: SaveSourceDocumentChangesInput,
  updates: Pick<SourceDocumentUpdatePort, "saveChangesAtomically">
) {
  return updates.saveChangesAtomically({ ledgerId, ...input });
}
