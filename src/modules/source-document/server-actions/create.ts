"use server";
import type { CreateSourceDocumentResponseDto } from "@/modules/source-document/contracts";
import {
  createSourceDocumentInputSchema,
  type CreateSourceDocumentInputContract,
} from "@/modules/source-document/contract-schemas";
import { omitUndefinedProperties } from "@/lib/validation";
import { createAndQueueSourceDocument } from "../application/use-cases/create-and-queue-source-document";
import { withSourceDocumentLedgerAccess } from "./access";

/**
 * Create a new source document and trigger processing
 */
export const createSourceDocumentAction = withSourceDocumentLedgerAccess(
  async (
    { ledgerId, ledger },
    input: CreateSourceDocumentInputContract
  ): Promise<CreateSourceDocumentResponseDto> => {
    const validated = createSourceDocumentInputSchema.parse(input);
    const payload = omitUndefinedProperties(validated);

    return createAndQueueSourceDocument({
      ledgerId,
      ledger,
      ...payload,
    });
  }
);
