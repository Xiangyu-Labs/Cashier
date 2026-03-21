"use server";
import type { SourceDocumentLightWithEntriesDto } from "@/modules/source-document/contracts";
import { getSourceDocumentLight } from "../application/queries/get-source-document-light";
import { withSourceDocumentLedgerAccess } from "./access";
import type { SourceDocumentLedgerActionContext } from "./access";

/**
 * Fetch a source document with light payload (excluding imageUrls).
 * Used for prefetching in list views where images are loaded on demand.
 */
export const getSourceDocumentLightAction = withSourceDocumentLedgerAccess(
  async (
    _context: SourceDocumentLedgerActionContext,
    id: string
  ): Promise<SourceDocumentLightWithEntriesDto | null> => {
    return getSourceDocumentLight(id);
  }
);
