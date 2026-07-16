"use server";
import type { SourceDocumentLightWithEntriesDto } from "@/modules/source-document/contracts";
import { getSourceDocumentLightForLedger } from "../application/queries/get-source-document-light";
import { withSourceDocumentLedgerAccess } from "./access";
import type { SourceDocumentLedgerActionContext } from "./access";
import { sourceDocumentIdSchema } from "../contract-schemas";
import { ValidationError } from "@/lib/errors";

/**
 * Fetch a source document with the normalized light payload used by detail/retry surfaces.
 */
export const getSourceDocumentLightAction = withSourceDocumentLedgerAccess(
  async (
    context: SourceDocumentLedgerActionContext,
    id: string
  ): Promise<SourceDocumentLightWithEntriesDto | null> => {
    const parsed = sourceDocumentIdSchema.safeParse(id);
    if (!parsed.success) {
      throw new ValidationError("Validation failed", { issues: parsed.error.issues });
    }
    return getSourceDocumentLightForLedger(context.ledgerId, parsed.data);
  }
);
