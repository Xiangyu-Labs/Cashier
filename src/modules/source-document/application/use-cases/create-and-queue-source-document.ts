import { formatDateTimeForApi, getDateInTimezone } from "@/lib/date-utils";
import { db } from "@/lib/db";
import { forLedger } from "@/lib/db/scoped-query";
import { ValidationError } from "@/lib/errors";
import { sourceDocuments, type Ledger } from "@/persistence";
import {
  getSourceDocumentTaskContext,
  prepareSourceDocumentTask,
  processImages,
} from "../services/processing";

export interface CreateAndQueueSourceDocumentInput {
  ledgerId: string;
  ledger: Ledger;
  text?: string;
  images?: Array<{ data: string; mimeType: string }>;
  originalImages?: Array<{ data: string; mimeType: string }>;
  entryDate?: string;
  timezone?: string;
}

function resolveEntryDate(entryDate?: string, timezone?: string): string {
  if (entryDate != null && entryDate !== "") {
    return entryDate;
  }

  return getDateInTimezone(timezone) ?? formatDateTimeForApi(new Date());
}

export async function createAndQueueSourceDocument(
  input: CreateAndQueueSourceDocumentInput
): Promise<{ sourceDocumentId: string; status: "queued" }> {
  const { ledgerId, ledger, text, images, originalImages, entryDate, timezone } = input;

  if ((text == null || text === "") && (images == null || images.length === 0)) {
    throw new ValidationError("At least one input (text or images) is required");
  }

  const q = forLedger(sourceDocuments, ledgerId);
  const [savedDoc] = await db
    .insert(sourceDocuments)
    .values({
      ledgerId,
      text: text ?? null,
      imageUrls: [],
      status: "queued",
      entryDate: resolveEntryDate(entryDate, timezone),
    })
    .returning();

  const imageUrls = await processImages(images, ledgerId, savedDoc.id);
  const originalImageUrls = await processImages(originalImages, ledgerId, savedDoc.id);
  const { categories, settings } = await getSourceDocumentTaskContext(ledgerId, ledger);

  await prepareSourceDocumentTask({
    ledgerId,
    sourceDocumentId: savedDoc.id,
    text,
    imageUrls,
    categories,
    settings,
  });

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
    status: "queued",
  };
}
