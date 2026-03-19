"use server";

import { requireLedgerAccess } from "@/modules/auth/access";
import { AppError, UnauthorizedError } from "@/lib/errors";
import { createAndQueueSourceDocument } from "../application/use-cases/create-and-queue-source-document";
import type { CreateSourceDocumentResponseDto } from "@/modules/source-document/contracts";
import {
  createSourceDocumentInputSchema,
  type CreateSourceDocumentInputContract,
} from "@/modules/source-document/contract-schemas";
import { omitUndefinedProperties } from "@/lib/validation";

/**
 * Create a new source document and trigger processing
 */
export async function createSourceDocumentAction(
  ledgerId: string,
  input: CreateSourceDocumentInputContract
): Promise<CreateSourceDocumentResponseDto> {
  const validated = createSourceDocumentInputSchema.parse(input);
  const payload = omitUndefinedProperties(validated);

  let ledger: Awaited<ReturnType<typeof requireLedgerAccess>>["ledger"];
  try {
    ({ ledger } = await requireLedgerAccess(ledgerId));
  } catch (error) {
    if (error instanceof AppError) {
      throw new UnauthorizedError("Unauthorized or Ledger not found");
    }
    throw error;
  }

  return createAndQueueSourceDocument({
    ledgerId,
    ledger,
    ...payload,
  });
}
