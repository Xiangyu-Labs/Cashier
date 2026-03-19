import { formatDateTimeForApi, getDateInTimezone } from "@/lib/date-utils";
import { db } from "@/lib/db";
import { forLedger } from "@/lib/db/scoped-query";
import { ValidationError } from "@/lib/errors";
import { omitUndefinedProperties } from "@/lib/validation";
import { submitFlowTask } from "@/lib/flow";
import { sourceDocuments, type Ledger } from "@/persistence";
import type { CreateSourceDocumentResponseDto } from "@/modules/source-document/contracts";
import { createSourceDocumentInputSchema } from "@/modules/source-document/contract-schemas";
import {
  getSourceDocumentTaskContext,
  processImages,
} from "../services/processing";
import { TASK_TYPE_PARSE_SOURCE_DOCUMENT } from "../tasks/parse-source-document";

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
  const { ledgerId, ledger, text, images, originalImages, entryDate, timezone } = input;

  const parsePayload = omitUndefinedProperties({
    text,
    images,
    originalImages,
    entryDate,
    timezone,
  });
  const parseResult = createSourceDocumentInputSchema.safeParse(parsePayload);

  if (!parseResult.success) {
    throw new ValidationError(
      parseResult.error.issues[0]?.message ?? "Invalid source document input"
    );
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

  if (savedDoc == null) {
    throw new ValidationError("Failed to create source document");
  }

  const imageUrls = await processImages(images, ledgerId, savedDoc.id);
  const originalImageUrls = await processImages(originalImages, ledgerId, savedDoc.id);
  const { categories, settings } = await getSourceDocumentTaskContext(ledgerId, ledger);

  const taskInput = {
    ledgerId,
    sourceDocumentId: savedDoc.id,
    imageUrls,
    aiLanguage: settings.aiLanguage,
    categories,
    settings: {
      ...(settings.settings.aiCustomPrompt !== undefined
        ? { aiCustomPrompt: settings.settings.aiCustomPrompt }
        : {}),
    },
    ...(text !== undefined ? { text } : {}),
    ...(settings.preferredCurrencies !== undefined
      ? { preferredCurrencies: settings.preferredCurrencies }
      : {}),
  };
  await submitFlowTask(TASK_TYPE_PARSE_SOURCE_DOCUMENT, taskInput, {
    title: "Parse source document",
    scopeId: ledgerId,
    entityType: "source_document",
    entityId: savedDoc.id,
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
