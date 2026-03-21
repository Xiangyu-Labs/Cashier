"use server";
import { canAccessSourceDocumentUploadQuery } from "../application/queries/can-access-source-document-upload";

export async function canAccessSourceDocumentUpload(
  ledgerId: string,
  sourceDocumentId: string,
  storageKey: string
): Promise<boolean> {
  return canAccessSourceDocumentUploadQuery(ledgerId, sourceDocumentId, storageKey);
}
