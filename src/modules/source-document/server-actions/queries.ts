"use server";
import { ValidationError } from "@/lib/errors";
import { withLedgerAccess } from "@/modules/ledger/access";
import { getSourceDocumentFullQuery } from "@/modules/source-document/application/queries/get-source-document-full";
import type { SourceDocumentFullDto } from "@/modules/source-document/contracts";
import { sourceDocumentIdSchema } from "@/modules/source-document/contract-schemas";
import { scheduleProcessingRecoveryAfter } from "@/application/processing/schedule-processing-recovery";
import { serverComposition } from "@/application/server-composition-root";

export const getSourceDocumentFullAction = withLedgerAccess(
  async (ledgerId: string, sourceDocumentId: string): Promise<SourceDocumentFullDto> => {
    const parsed = sourceDocumentIdSchema.safeParse(sourceDocumentId);
    if (!parsed.success) {
      throw new ValidationError("Validation failed", { issues: parsed.error.issues });
    }
    scheduleProcessingRecoveryAfter(ledgerId);
    return getSourceDocumentFullQuery(ledgerId, parsed.data, serverComposition.sourceDocumentReads);
  }
);
