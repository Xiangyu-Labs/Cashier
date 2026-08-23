"use server";

import { withLedgerAccess } from "@/modules/ledger/access";
import { parseLedgerEntryIds } from "@/modules/ledger/contract-schemas";
import { serverComposition } from "@/application/server-composition-root";
import { previewSourceDocumentDateImpact } from "@/modules/workspace/application/use-cases/preview-source-document-date-impact";

export const previewSourceDocumentDateImpactAction = withLedgerAccess(
  async (ledgerId: string, input: { sourceDocumentIds: string[]; ledgerEntryIds: string[] }) =>
    previewSourceDocumentDateImpact(
      {
        ledgerId,
        sourceDocumentIds: input.sourceDocumentIds,
        ledgerEntryIds: parseLedgerEntryIds(input.ledgerEntryIds),
      },
      serverComposition.ledgerReads
    )
);
