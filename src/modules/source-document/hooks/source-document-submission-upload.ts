"use client";

import { compressImage } from "@/lib/image-utils";
import {
  API_V1_MAX_DECODED_BATCH_BYTES,
  API_V1_MAX_IMAGES,
  API_V1_MAX_REQUEST_BYTES,
} from "@/app/api/v1/_shared/limits";
import type { SourceDocumentSubmitPayload } from "./source-document-input-controller.types";

export interface SourceDocumentSubmissionProgress {
  phase: "preparing" | "planning" | "uploading" | "finalizing" | "submitting" | "complete";
  percent: number;
  loadedBytes?: number;
  totalBytes?: number;
  fileIndex?: number;
  fileCount?: number;
}

export type SourceDocumentSubmissionUploadStage = "prepare" | "plan" | "upload" | "finalize";

export class SourceDocumentSubmissionUploadError extends Error {
  constructor(
    message: string,
    public readonly stage: SourceDocumentSubmissionUploadStage,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "SourceDocumentSubmissionUploadError";
  }
}

interface InlinePreparationDependencies {
  compress?: typeof compressImage;
}

const DATA_URL_PATTERN = /^data:image\/[a-z0-9.+-]+;base64,([A-Za-z0-9+/]*={0,2})$/i;
const QUALITY_STEPS = [0.78, 0.68, 0.58, 0.48, 0.38] as const;

function dataUrlToFile(dataUrl: string, index: number): File {
  const match = DATA_URL_PATTERN.exec(dataUrl);
  if (match == null) throw new SourceDocumentSubmissionUploadError("Invalid image data", "prepare");
  let binary: string;
  try {
    binary = atob(match[1]!);
  } catch (error) {
    throw new SourceDocumentSubmissionUploadError("Failed to decode image", "prepare", {
      cause: error,
    });
  }
  if (binary.length === 0) {
    throw new SourceDocumentSubmissionUploadError("Image data is empty", "prepare");
  }
  const bytes = new Uint8Array(binary.length);
  for (let offset = 0; offset < binary.length; offset += 1) bytes[offset] = binary.charCodeAt(offset);
  return new File([bytes], `source-${index}.jpg`, { type: "image/jpeg" });
}

function payloadWithinLimits(payload: SourceDocumentSubmitPayload): boolean {
  const bodyBytes = new TextEncoder().encode(JSON.stringify(payload)).byteLength;
  if (bodyBytes > API_V1_MAX_REQUEST_BYTES) return false;
  const decodedBytes = (payload.images ?? []).reduce((total, image) => {
    const match = DATA_URL_PATTERN.exec(image.data);
    return total + (match == null ? Number.POSITIVE_INFINITY : atob(match[1]!).length);
  }, 0);
  return decodedBytes <= API_V1_MAX_DECODED_BATCH_BYTES;
}

function submissionBase(payload: SourceDocumentSubmitPayload): SourceDocumentSubmitPayload {
  return {
    entryDate: payload.entryDate,
    ...(payload.timezone == null ? {} : { timezone: payload.timezone }),
    ...(payload.text == null ? {} : { text: payload.text }),
    ...(payload.storedFileIds == null ? {} : { storedFileIds: payload.storedFileIds }),
  };
}

export async function uploadSourceDocumentSubmissionImages(
  _ledgerId: string,
  payload: SourceDocumentSubmitPayload,
  dependencies: InlinePreparationDependencies = {},
  onProgress?: (progress: SourceDocumentSubmissionProgress) => void
): Promise<SourceDocumentSubmitPayload> {
  const images = payload.images ?? [];
  const base = submissionBase(payload);
  if (images.length === 0) return base;
  if (images.length + (payload.storedFileIds?.length ?? 0) > API_V1_MAX_IMAGES) {
    throw new SourceDocumentSubmissionUploadError("Maximum 3 images allowed", "prepare");
  }

  onProgress?.({ phase: "preparing", percent: 0, fileCount: images.length });
  const originals = images.map((image, index) => dataUrlToFile(image.data, index));
  const compress = dependencies.compress ?? compressImage;

  for (let qualityIndex = 0; qualityIndex < QUALITY_STEPS.length; qualityIndex += 1) {
    const quality = QUALITY_STEPS[qualityIndex]!;
    let compressed;
    try {
      compressed = await Promise.all(
        originals.map((file) => compress(file, 1080, 1080, quality))
      );
    } catch (error) {
      throw new SourceDocumentSubmissionUploadError("Failed to compress source image", "prepare", {
        cause: error,
      });
    }
    const candidate: SourceDocumentSubmitPayload = {
      ...base,
      images: compressed.map((image) => ({ data: image.data, mimeType: "image/jpeg" })),
    };
    onProgress?.({
      phase: "preparing",
      percent: Math.min(80, 15 + qualityIndex * 15),
      fileCount: images.length,
    });
    if (payloadWithinLimits(candidate)) {
      onProgress?.({ phase: "submitting", percent: 90, fileCount: images.length });
      return candidate;
    }
  }

  throw new SourceDocumentSubmissionUploadError(
    "Images cannot be compressed within the 4 MiB request limit",
    "prepare"
  );
}
