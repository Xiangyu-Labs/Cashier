"use server";
import type { SourceDocumentDto } from "@/modules/source-document/contracts";
import { getSourceDocumentDetail } from "../application/queries/get-source-document-detail";
import { sourceDocumentIdSchema } from "../contract-schemas";
import { ValidationError } from "@/lib/errors";
import { requireLedgerAccess } from "@/modules/ledger/access";
import { serverComposition } from "@/application/server-composition-root";

/**
 * Fetch a source document by its global ID.
 * Verifies access to the associated ledger.
 * Returns null for both "not found" and "not authorized" to avoid information leakage.
 *
 * Note: This action doesn't use withLedgerAccess because the ledgerId is not known
 * until after we fetch the document metadata. It also returns null instead of throwing
 * to avoid leaking document existence information.
 */
export async function getSourceDocumentByIdAction(id: string): Promise<SourceDocumentDto | null> {
  const parsed = sourceDocumentIdSchema.safeParse(id);
  if (!parsed.success) {
    throw new ValidationError("Validation failed", { issues: parsed.error.issues });
  }
  return getSourceDocumentDetail(
    parsed.data,
    {
      documents: serverComposition.sourceDocumentReads,
      ledgerReads: serverComposition.ledgerReads,
    },
    requireLedgerAccess
  );
}
