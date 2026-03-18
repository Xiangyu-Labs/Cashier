"use server";

import { db } from "@/lib/db";
import { sourceDocuments } from "@/lib/db/schema";
import { requireLedgerAccess } from "@/features/auth/server/utils/helpers";
import { forLedger } from "@/lib/db/scoped-query";
import { formatDateTimeForApi } from "@/lib/date-utils";
import { prepareSourceDocumentTask, processImages } from "./helpers";
import type { SourceDocumentActionInput } from "./types";
import { AppError, UnauthorizedError, ValidationError } from "@/lib/errors";

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

  const q = forLedger(sourceDocuments, ledgerId);

  // Save source document with 'queued' status
  const today = entryDate != null && entryDate !== "" ? entryDate : formatDateTimeForApi(new Date());
  const [savedDoc] = await db
    .insert(sourceDocuments)
    .values({
      ledgerId: ledgerId, // Explicitly set ledgerId
      text: text ?? null,
      imageUrls: [], // Will update after normalized
      status: "queued",
      entryDate: today,
    })
    .returning();

  const imageUrls = await prepareSourceDocumentTask(ledgerId, ledger, text, images, savedDoc.id);
  const originalImageUrls =
    originalImages != null && originalImages.length > 0
      ? await processImages(originalImages, ledgerId, savedDoc.id)
      : [];

  // Update with normalized image URLs if any
  if (imageUrls.length > 0 || originalImageUrls.length > 0) {
    await db
      .update(sourceDocuments)
      .set({
        ...(imageUrls.length > 0 ? { imageUrls } : {}),
        ...(originalImageUrls.length > 0 ? { metadata: { originalImageUrls } } : {}),
      })
      .where(q.whereId(savedDoc.id));
  }

  return {
    sourceDocumentId: savedDoc.id,
    status: "queued" as const,
  };
}
