"use server";

import { requireLedgerAccess } from "@/modules/auth/access";
import { retrySourceDocument } from "@/modules/source-document/application/use-cases/retry-source-document";
import type { RetrySourceDocumentResponseDto } from "@/modules/source-document/contracts";
import {
  retrySourceDocumentInputSchema,
  type RetrySourceDocumentInputContract,
} from "@/modules/source-document/contract-schemas";
import { omitUndefinedProperties } from "@/lib/validation";

/**
 * Retry an existing source document with optional new data
 *
 * New approach: Edit retry = soft delete old document + create brand new document
 * This decouples "cancel task" from "retain/delete document" logic:
 * - Real cancel: call cancelTaskAction → cancel task + soft delete document
 * - Edit retry: call retrySourceDocumentAction → soft delete old + create new + submit new task
 */
export async function retrySourceDocumentAction(
  ledgerId: string,
  sourceDocumentId: string,
  input?: RetrySourceDocumentInputContract
): Promise<RetrySourceDocumentResponseDto> {
  const { ledger } = await requireLedgerAccess(ledgerId);
  const validatedInput =
    input == null ? null : omitUndefinedProperties(retrySourceDocumentInputSchema.parse(input));
  return retrySourceDocument({
    ledgerId,
    ledger,
    sourceDocumentId,
    ...(validatedInput == null ? {} : { input: validatedInput }),
  });
}
