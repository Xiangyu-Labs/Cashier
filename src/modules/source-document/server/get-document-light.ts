import type { SourceDocumentLightWithEntriesDto } from "@/modules/source-document/contracts";
import { getSourceDocumentLightForLedger } from "../application/queries/get-source-document-light";
import { withLedgerAccess } from "@/modules/ledger/access";
import { sourceDocumentIdSchema } from "../contract-schemas";
import { ValidationError } from "@/lib/errors";
import { serverComposition } from "@/application/server-composition-root";

/**
 * Fetch a source document with the normalized light payload used by detail/retry surfaces.
 */
export const getSourceDocumentLightAction = withLedgerAccess(
  async (ledgerId: string, id: string): Promise<SourceDocumentLightWithEntriesDto | null> => {
    const parsed = sourceDocumentIdSchema.safeParse(id);
    if (!parsed.success) {
      throw new ValidationError("Validation failed", { issues: parsed.error.issues });
    }
    return getSourceDocumentLightForLedger(
      ledgerId,
      parsed.data,
      serverComposition.sourceDocumentReads
    );
  }
);
