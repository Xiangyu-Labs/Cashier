import { formatDateTimeForApi, getDateInTimezone } from "@/lib/date-utils";
import { db } from "@/lib/db";
import { forLedger } from "@/lib/db/scoped-query";
import { ValidationError } from "@/lib/errors";
import { omitUndefinedProperties } from "@/lib/validation";
import { sourceDocuments, type Ledger } from "@/persistence";
import type { CreateSourceDocumentResponseDto } from "@/modules/source-document/contracts";
import { parseCreateSourceDocumentInput } from "@/modules/source-document/contract-schemas";
import { toSourceDocumentSubmissionContract } from "@/application/contracts";
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
): Promise<CreateSourceDocumentResponseDto> {
  const { ledgerId, ledger } = input;

  const parsePayload = omitUndefinedProperties({
    text: input.text,
    images: input.images,
    originalImages: input.originalImages,
    entryDate: input.entryDate,
    timezone: input.timezone,
  });
  const validated = parseCreateSourceDocumentInput(parsePayload);
  const { text, images, originalImages, entryDate, timezone } = validated;

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

  if (savedDoc == null) {
    throw new ValidationError("Failed to create source document");
  }

  const imageUrls = await processImages(images, ledgerId, savedDoc.id);
  const originalImageUrls = await processImages(originalImages, ledgerId, savedDoc.id);
  const taskContext = await getSourceDocumentTaskContext(ledgerId, ledger);
  await prepareSourceDocumentTask({
    ledgerId,
    sourceDocumentId: savedDoc.id,
    imageUrls,
    categories: taskContext.categories,
    settings: taskContext.settings,
    ...(text !== undefined ? { text } : {}),
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

  return toSourceDocumentSubmissionContract({ id: savedDoc.id });
}
