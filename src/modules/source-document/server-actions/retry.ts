"use server";
import { retrySourceDocument } from "@/modules/source-document/application/use-cases/retry-source-document";
import type { RetrySourceDocumentResponseDto } from "@/modules/source-document/contracts";
import {
  retrySourceDocumentInputSchema,
  type RetrySourceDocumentInputContract,
} from "@/modules/source-document/contract-schemas";
import { omitUndefinedProperties } from "@/lib/validation";
import { withSourceDocumentLedgerAccess } from "./access";

/**
 * Retry an existing source document with optional new data
 *
 * Edit retry soft-deletes the prior document, creates a replacement, and queues parsing.
 * Internal cancellation remains part of the document lifecycle and is not a public action.
 */
export const retrySourceDocumentAction = withSourceDocumentLedgerAccess(
  async (
    { ledgerId, ledger },
    sourceDocumentId: string,
    input?: RetrySourceDocumentInputContract
  ): Promise<RetrySourceDocumentResponseDto> => {
    const validatedInput =
      input == null ? null : omitUndefinedProperties(retrySourceDocumentInputSchema.parse(input));

    return retrySourceDocument({
      ledgerId,
      ledger,
      sourceDocumentId,
      ...(validatedInput == null ? {} : { input: validatedInput }),
    });
  }
);
