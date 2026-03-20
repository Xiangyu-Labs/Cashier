"use server";

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
import {
  batchUpdateSourceDocuments,
  updateSourceDocument,
  updateSourceDocumentImages,
} from "../application/use-cases/update-source-document";
import { withSourceDocumentLedgerAccess } from "./access";

/**
 * Update source document metadata (e.g. title, entryDate)
 */
export const updateSourceDocumentAction = withSourceDocumentLedgerAccess(
  async (
    { ledgerId },
    sourceId: string,
    data: UpdateSourceDocumentInput
  ): Promise<UpdateSourceDocumentResultDto> => {
    const validated = updateSourceDocumentInputSchema.parse(data);
    return updateSourceDocument({
      ledgerId,
      sourceDocumentId: sourceId,
      data: validated,
    });
  }
);

export const updateSourceDocumentImagesAction = withSourceDocumentLedgerAccess(
  async (
    { ledgerId },
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

    return updateSourceDocumentImages({
      ledgerId,
      sourceDocumentId: sourceId,
      images: validatedImages,
      ...(validatedOriginalImages != null ? { originalImages: validatedOriginalImages } : {}),
    });
  }
);

/**
 * Batch update multiple source documents
 */
export const batchUpdateSourceDocumentsAction = withSourceDocumentLedgerAccess(
  async (
    { ledgerId },
    sourceDocumentIds: string[],
    data: BatchUpdateSourceDocumentsInput
  ): Promise<BatchUpdateSourceDocumentsResultDto> => {
    const validated = batchUpdateSourceDocumentsInputSchema.parse(data);
    return batchUpdateSourceDocuments({
      ledgerId,
      sourceDocumentIds,
      data: validated,
    });
  }
);
