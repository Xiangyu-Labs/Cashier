"use server";
import type { SourceDocumentLightWithEntriesDto } from "@/modules/source-document/contracts";
import { getSourceDocumentLight } from "../application/queries/get-source-document-light";
import { withSourceDocumentLedgerAccess } from "./access";
import type { SourceDocumentLedgerActionContext } from "./access";

/**
 * Fetch a source document with the normalized light payload used by detail/retry surfaces.
 */
export const getSourceDocumentLightAction = withSourceDocumentLedgerAccess(
  async (
    _context: SourceDocumentLedgerActionContext,
    id: string
  ): Promise<SourceDocumentLightWithEntriesDto | null> => {
    return getSourceDocumentLight(id);
  }
);
