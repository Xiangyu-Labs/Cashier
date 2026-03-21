"use server";
import type { SourceDocumentLightWithEntriesDto } from "@/modules/source-document/contracts";
import { getSourceDocumentLight } from "../application/queries/get-source-document-light";

/**
 * Fetch a source document with light payload (excluding imageUrls).
 * Used for prefetching in list views where images are loaded on demand.
 */
export async function getSourceDocumentLightAction(
  id: string
): Promise<SourceDocumentLightWithEntriesDto | null> {
  return getSourceDocumentLight(id);
}
