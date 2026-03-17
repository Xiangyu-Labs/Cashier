"use server";

import { db } from "@/lib/db";
import { sourceDocuments } from "@/lib/db/schema";
import { requireLedgerAccess } from "@/features/auth/server/utils/helpers";
import { forLedger } from "@/lib/db/scoped-query";
import { formatDateTimeForApi } from "@/lib/date-utils";
import { prepareSourceDocumentTask } from "./helpers";
import type { SourceDocumentActionInput } from "./types";
import { ValidationError, UnauthorizedError } from "@/lib/errors";

/**
 * Create a new source document and trigger processing
 */
export async function createSourceDocumentAction(
  ledgerId: string,
  input: SourceDocumentActionInput
) {
  const { text, images, entryDate } = input;
  if (!text && (!images || images.length === 0)) {
    throw new ValidationError("At least one input (text or images) is required");
  }

  const { ledger, error } = await requireLedgerAccess(ledgerId);
  if (error) throw new UnauthorizedError("Unauthorized or Ledger not found");

  const q = forLedger(sourceDocuments, ledgerId);

  // Save source document with 'queued' status
  const today = entryDate || formatDateTimeForApi(new Date());
  const [savedDoc] = await db
    .insert(sourceDocuments)
    .values({
      ledgerId: ledgerId, // Explicitly set ledgerId
      text: text || null,
      imageUrls: [], // Will update after normalized
      status: "queued",
      entryDate: today,
    })
    .returning();

  const imageUrls = await prepareSourceDocumentTask(ledgerId, ledger, text, images, savedDoc.id);

  // Update with normalized image URLs if any
  if (imageUrls.length > 0) {
    await db.update(sourceDocuments).set({ imageUrls }).where(q.whereId(savedDoc.id));
  }

  return {
    sourceDocumentId: savedDoc.id,
    status: "queued" as const,
  };
}
