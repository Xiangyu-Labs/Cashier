"use server";

import { requireLedgerAccess } from "@/modules/auth/helpers";
import type { SourceDocumentActionInput } from "./types";
import { AppError, UnauthorizedError, ValidationError } from "@/lib/errors";
import { createAndQueueSourceDocument } from "../application/use-cases/create-and-queue-source-document";

/**
 * Create a new source document and trigger processing
 */
export async function createSourceDocumentAction(
  ledgerId: string,
  input: SourceDocumentActionInput
) {
  const { text, images, originalImages, entryDate } = input;
  if ((text == null || text === "") && (images == null || images.length === 0)) {
    throw new ValidationError("At least one input (text or images) is required");
  }

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
    text,
    images,
    originalImages,
    entryDate,
  });
}
