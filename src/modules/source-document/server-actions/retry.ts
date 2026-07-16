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
 * Every retry queues a new immutable revision under the stable document identity.
 */
export const retrySourceDocumentAction = withSourceDocumentLedgerAccess(
  async (
    { ledgerId },
    sourceDocumentId: string,
    input?: RetrySourceDocumentInputContract
  ): Promise<RetrySourceDocumentResponseDto> => {
    const validatedInput =
      input == null ? null : omitUndefinedProperties(retrySourceDocumentInputSchema.parse(input));

    return retrySourceDocument({
      ledgerId,
      sourceDocumentId,
      ...(validatedInput == null ? {} : { input: validatedInput }),
    });
  }
);
