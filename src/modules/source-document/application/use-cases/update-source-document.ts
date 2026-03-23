import { db } from "@/lib/db";
import type {
  BatchUpdateSourceDocumentsResultDto,
  UpdateSourceDocumentResultDto,
} from "@/modules/source-document/contracts";
import type { SourceDocMetadata } from "@/modules/source-document/types";
import { sourceDocuments } from "@/persistence";
import { and, inArray } from "drizzle-orm";
import type {
  BatchUpdateSourceDocumentsInput as BatchUpdateSourceDocumentsPayload,
  UpdateSourceDocumentInput as UpdateSourceDocumentPayload,
} from "../../contract-schemas";
import {
  whereSourceDocumentNotDeleted,
  whereSourceDocumentNotDeletedId,
} from "../source-document-state";
import { processImages } from "../services/processing";

interface UpdateSourceDocumentInput {
  ledgerId: string;
  sourceDocumentId: string;
  data: UpdateSourceDocumentPayload;
}

interface UpdateSourceDocumentImagesInput {
  ledgerId: string;
  sourceDocumentId: string;
  images: Array<{ data: string; mimeType: string }>;
  originalImages?: Array<{ data: string; mimeType: string }>;
}

interface BatchUpdateSourceDocumentsInput {
  ledgerId: string;
  sourceDocumentIds: string[];
  data: BatchUpdateSourceDocumentsPayload;
}

function getOriginalImageUrls(
  metadata: SourceDocMetadata | null | undefined
): Array<string | null> {
  if (!Array.isArray(metadata?.originalImageUrls)) {
    return [];
  }

  return metadata.originalImageUrls;
}

export async function updateSourceDocument({
  ledgerId,
  sourceDocumentId,
  data,
}: UpdateSourceDocumentInput): Promise<UpdateSourceDocumentResultDto> {
  const updatePatch = {
    updatedAt: new Date(),
    ...(data.title !== undefined ? { title: data.title } : {}),
    ...(data.entryDate !== undefined ? { entryDate: data.entryDate } : {}),
  };

  const updatedDocuments = await db
    .update(sourceDocuments)
    .set(updatePatch)
    .where(whereSourceDocumentNotDeletedId(ledgerId, sourceDocumentId))
    .returning({ id: sourceDocuments.id });

  return {
    sourceDocumentId,
    updated: updatedDocuments.length > 0,
  };
}

export async function updateSourceDocumentImages({
  ledgerId,
  sourceDocumentId,
  images,
  originalImages,
}: UpdateSourceDocumentImagesInput): Promise<UpdateSourceDocumentResultDto> {
  if (images.length === 0) {
    return {
      sourceDocumentId,
      updated: false,
    };
  }

  const existingDoc = await db.query.sourceDocuments.findFirst({
    where: whereSourceDocumentNotDeletedId(ledgerId, sourceDocumentId),
  });

  if (!existingDoc) {
    return {
      sourceDocumentId,
      updated: false,
    };
  }

  const nextImageUrls = await processImages(images, ledgerId, sourceDocumentId);
  const existingOriginalUrls = getOriginalImageUrls(existingDoc.metadata);
  const nextOriginalUrls =
    existingOriginalUrls.length > 0
      ? [...existingOriginalUrls]
      : originalImages != null && originalImages.length > 0
        ? (await processImages(originalImages, ledgerId, sourceDocumentId)).map(
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
    .where(whereSourceDocumentNotDeletedId(ledgerId, sourceDocumentId))
    .returning({ id: sourceDocuments.id });

  return {
    sourceDocumentId,
    updated: updatedDocuments.length > 0,
  };
}

export async function batchUpdateSourceDocuments({
  ledgerId,
  sourceDocumentIds,
  data,
}: BatchUpdateSourceDocumentsInput): Promise<BatchUpdateSourceDocumentsResultDto> {
  if (sourceDocumentIds.length === 0) {
    return {
      sourceDocumentIds,
      updatedCount: 0,
    };
  }

  const updatePatch = {
    updatedAt: new Date(),
    ...(data.status !== undefined ? { status: data.status } : {}),
    ...(data.title !== undefined ? { title: data.title } : {}),
    ...(data.entryDate !== undefined ? { entryDate: data.entryDate } : {}),
  };

  const updatedDocuments = await db
    .update(sourceDocuments)
    .set(updatePatch)
    .where(
      and(whereSourceDocumentNotDeleted(ledgerId), inArray(sourceDocuments.id, sourceDocumentIds))
    )
    .returning({ id: sourceDocuments.id });

  return {
    sourceDocumentIds,
    updatedCount: updatedDocuments.length,
  };
}
