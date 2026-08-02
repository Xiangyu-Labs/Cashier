import type {
  CredentialSourceDocumentReadPort,
  CredentialSourceDocumentStatusResult,
} from "../ports";

export type { CredentialSourceDocumentStatusResult } from "../ports";

export function getCredentialSourceDocumentStatus(
  ledgerId: string,
  sourceDocumentId: string,
  documents: CredentialSourceDocumentReadPort
): Promise<CredentialSourceDocumentStatusResult | null> {
  return documents.getStatus(ledgerId, sourceDocumentId);
}
