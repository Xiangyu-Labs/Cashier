"use server";

import { db } from "@/lib/db";
import { sourceDocuments } from "@/persistence";
import { withLedgerAccess } from "@/lib/auth-actions";
import { forLedger } from "@/lib/db/scoped-query";
import { and, inArray } from "drizzle-orm";
import { ValidationError } from "@/lib/errors";
import {
  type SourceDocMetadata,
  type SourceDocumentStatusType,
} from "@/modules/source-document/types";
import { processImages } from "./helpers";

const VALID_STATUSES: SourceDocumentStatusType[] = [
  "queued",
  "processing",
  "completed",
  "anomaly",
  "failed",
];

function getOriginalImageUrls(metadata: SourceDocMetadata | null | undefined): Array<string | null> {
  if (!Array.isArray(metadata?.originalImageUrls)) {
    return [];
  }

  return metadata.originalImageUrls;
}

/**
 * Update source document metadata (e.g. title, entryDate)
 */
export const updateSourceDocumentAction = withLedgerAccess(
  async (
    ledgerId: string,
    sourceId: string,
    data: { title?: string; entryDate?: string }
  ): Promise<void> => {
    const q = forLedger(sourceDocuments, ledgerId);

    await db
      .update(sourceDocuments)
      .set({ ...data, updatedAt: new Date() })
      .where(q.whereId(sourceId));
  }
);

export const updateSourceDocumentImagesAction = withLedgerAccess(
  async (
    ledgerId: string,
    sourceId: string,
    images: { data: string; mimeType: string }[],
    originalImages?: { data: string; mimeType: string }[]
  ): Promise<void> => {
    if (images.length === 0) return;

    const q = forLedger(sourceDocuments, ledgerId);
    const existingDoc = await db.query.sourceDocuments.findFirst({
      where: q.whereId(sourceId),
    });

    if (!existingDoc) return;

    const nextImageUrls = await processImages(images, ledgerId, sourceId);
    const existingOriginalUrls = getOriginalImageUrls(existingDoc.metadata);
    const nextOriginalUrls =
      existingOriginalUrls.length > 0
        ? [...existingOriginalUrls]
        : originalImages != null && originalImages.length > 0
          ? (await processImages(originalImages, ledgerId, sourceId)).map((url) => url ?? null)
          : [];

    const previousImageUrls = existingDoc.imageUrls ?? [];

    for (let index = 0; index < nextImageUrls.length; index += 1) {
      const previousImageUrl = previousImageUrls[index];
      const nextImageUrl = nextImageUrls[index];

      if (
        previousImageUrl == null ||
        previousImageUrl === "" ||
        nextImageUrl == null ||
        nextImageUrl === "" ||
        previousImageUrl === nextImageUrl
      ) {
        continue;
      }

      if (nextOriginalUrls[index] == null || nextOriginalUrls[index] === "") {
        nextOriginalUrls[index] = previousImageUrl;
      }
    }

    const { originalImageUrls: _originalImageUrls, ...restMetadata } = existingDoc.metadata ?? {};
    const metadata =
      nextOriginalUrls.some((url) => url != null && url !== "")
        ? { ...restMetadata, originalImageUrls: nextOriginalUrls }
        : restMetadata;

    await db
      .update(sourceDocuments)
      .set({
        imageUrls: nextImageUrls,
        metadata,
        updatedAt: new Date(),
      })
      .where(q.whereId(sourceId));
  }
);

/**
 * Batch update multiple source documents
 */
export const batchUpdateSourceDocumentsAction = withLedgerAccess(
  async (
    ledgerId: string,
    sourceDocumentIds: string[],
    data: { status?: string; title?: string; entryDate?: string }
  ): Promise<void> => {
    if (sourceDocumentIds.length === 0) return;

    const { status } = data;
    if (status != null && status !== "" && !VALID_STATUSES.includes(status as SourceDocumentStatusType)) {
      throw new ValidationError(`Invalid status: ${status}`);
    }

    const q = forLedger(sourceDocuments, ledgerId);

    await db
      .update(sourceDocuments)
      .set(data as Partial<typeof sourceDocuments.$inferSelect>)
      .where(and(q.whereActive, inArray(sourceDocuments.id, sourceDocumentIds)));
  }
);
