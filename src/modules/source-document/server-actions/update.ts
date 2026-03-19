"use server";

import { db } from "@/lib/db";
import { sourceDocuments } from "@/persistence";
import { withLedgerAccess } from "@/lib/auth-actions";
import { forLedger } from "@/lib/db/scoped-query";
import { and, inArray } from "drizzle-orm";
import { type SourceDocMetadata } from "@/modules/source-document/types";
import type {
  BatchUpdateSourceDocumentsResultDto,
  UpdateSourceDocumentResultDto,
} from "@/modules/source-document/contracts";
import {
  batchUpdateSourceDocumentsInputSchema,
  sourceDocumentImagesInputSchema,
  updateSourceDocumentInputSchema,
  type BatchUpdateSourceDocumentsInput,
  type UpdateSourceDocumentInput,
} from "@/modules/source-document/contract-schemas";
import { processImages } from "./helpers";

function getOriginalImageUrls(
  metadata: SourceDocMetadata | null | undefined
): Array<string | null> {
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
    data: UpdateSourceDocumentInput
  ): Promise<UpdateSourceDocumentResultDto> => {
    const validated = updateSourceDocumentInputSchema.parse(data);
    const q = forLedger(sourceDocuments, ledgerId);
    const updatePatch = {
      updatedAt: new Date(),
      ...(validated.title !== undefined ? { title: validated.title } : {}),
      ...(validated.entryDate !== undefined ? { entryDate: validated.entryDate } : {}),
    };

    const updatedDocuments = await db
      .update(sourceDocuments)
      .set(updatePatch)
      .where(q.whereId(sourceId))
      .returning({ id: sourceDocuments.id });

    return {
      sourceDocumentId: sourceId,
      updated: updatedDocuments.length > 0,
    };
  }
);

export const updateSourceDocumentImagesAction = withLedgerAccess(
  async (
    ledgerId: string,
    sourceId: string,
    images: { data: string; mimeType: string }[],
    originalImages?: { data: string; mimeType: string }[]
  ): Promise<UpdateSourceDocumentResultDto> => {
    const validatedImages = sourceDocumentImagesInputSchema.parse(images);
    const validatedOriginalImages =
      originalImages == null ? undefined : sourceDocumentImagesInputSchema.parse(originalImages);

    if (validatedImages.length === 0) {
      return {
        sourceDocumentId: sourceId,
        updated: false,
      };
    }

    const q = forLedger(sourceDocuments, ledgerId);
    const existingDoc = await db.query.sourceDocuments.findFirst({
      where: q.whereId(sourceId),
    });

    if (!existingDoc) {
      return {
        sourceDocumentId: sourceId,
        updated: false,
      };
    }

    const nextImageUrls = await processImages(validatedImages, ledgerId, sourceId);
    const existingOriginalUrls = getOriginalImageUrls(existingDoc.metadata);
    const nextOriginalUrls =
      existingOriginalUrls.length > 0
        ? [...existingOriginalUrls]
        : validatedOriginalImages != null && validatedOriginalImages.length > 0
          ? (await processImages(validatedOriginalImages, ledgerId, sourceId)).map(
              (url) => url ?? null
            )
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
    const metadata = nextOriginalUrls.some((url) => url != null && url !== "")
      ? { ...restMetadata, originalImageUrls: nextOriginalUrls }
      : restMetadata;

    const updatedDocuments = await db
      .update(sourceDocuments)
      .set({
        imageUrls: nextImageUrls,
        metadata,
        updatedAt: new Date(),
      })
      .where(q.whereId(sourceId))
      .returning({ id: sourceDocuments.id });

    return {
      sourceDocumentId: sourceId,
      updated: updatedDocuments.length > 0,
    };
  }
);

/**
 * Batch update multiple source documents
 */
export const batchUpdateSourceDocumentsAction = withLedgerAccess(
  async (
    ledgerId: string,
    sourceDocumentIds: string[],
    data: BatchUpdateSourceDocumentsInput
  ): Promise<BatchUpdateSourceDocumentsResultDto> => {
    if (sourceDocumentIds.length === 0) {
      return {
        sourceDocumentIds,
        updatedCount: 0,
      };
    }

    const validated = batchUpdateSourceDocumentsInputSchema.parse(data);
    const q = forLedger(sourceDocuments, ledgerId);
    const updatePatch = {
      updatedAt: new Date(),
      ...(validated.status !== undefined ? { status: validated.status } : {}),
      ...(validated.title !== undefined ? { title: validated.title } : {}),
      ...(validated.entryDate !== undefined ? { entryDate: validated.entryDate } : {}),
    };

    const updatedDocuments = await db
      .update(sourceDocuments)
      .set(updatePatch)
      .where(and(q.whereActive, inArray(sourceDocuments.id, sourceDocumentIds)))
      .returning({ id: sourceDocuments.id });

    return {
      sourceDocumentIds,
      updatedCount: updatedDocuments.length,
    };
  }
);
