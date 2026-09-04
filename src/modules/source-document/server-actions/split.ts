"use server";

import { serverComposition } from "@/application/server-composition-root";
import type {
  SplitSourceDocumentInput,
  VersionedCommandResult,
  SplitSourceDocumentResultDto,
} from "@/modules/source-document/contracts";
import { splitSourceDocumentInputSchema } from "@/modules/source-document/contract-schemas";
import { splitSourceDocument } from "../application/use-cases/split-source-document";
import { withSourceDocumentLedgerAccess } from "./access";

export const splitSourceDocumentAction = withSourceDocumentLedgerAccess(
  async (
    { ledgerId },
    input: SplitSourceDocumentInput
  ): Promise<VersionedCommandResult<SplitSourceDocumentResultDto>> => {
    const validated = splitSourceDocumentInputSchema.parse(input);
    return splitSourceDocument(ledgerId, validated, {
      documents: serverComposition.sourceDocumentReads,
      updates: serverComposition.sourceDocumentUpdates,
    });
  }
);
