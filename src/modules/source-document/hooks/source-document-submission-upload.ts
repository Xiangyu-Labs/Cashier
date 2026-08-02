"use client";

import { compressImage } from "@/lib/image-utils";
import { API_V1_MAX_IMAGES } from "@/app/api/v1/_shared/limits";
import type { SourceDocumentSubmitPayload } from "./source-document-input-controller.types";
import {
  createSourceDocumentUploadPlanAction,
  finalizeSourceDocumentUploadAction,
} from "../actions";

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
  createPlan?: typeof createSourceDocumentUploadPlanAction;
  finalize?: typeof finalizeSourceDocumentUploadAction;
  put?: typeof fetch;
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
  for (let offset = 0; offset < binary.length; offset += 1)
    bytes[offset] = binary.charCodeAt(offset);
  return new File([bytes], `source-${index}.jpg`, { type: "image/jpeg" });
}

function submissionBase(payload: SourceDocumentSubmitPayload): SourceDocumentSubmitPayload {
  return {
    entryDate: payload.entryDate,
    ...(payload.timezone == null ? {} : { timezone: payload.timezone }),
    ...(payload.text == null ? {} : { text: payload.text }),
    ...(payload.storedFileIds == null ? {} : { storedFileIds: payload.storedFileIds }),
  };
}

async function sha256(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
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
      compressed = await Promise.all(originals.map((file) => compress(file, 1080, 1080, quality)));
    } catch (error) {
      throw new SourceDocumentSubmissionUploadError("Failed to compress source image", "prepare", {
        cause: error,
      });
    }
    const files = compressed.map((image, index) => dataUrlToFile(image.data, index));
    onProgress?.({
      phase: "preparing",
      percent: Math.min(80, 15 + qualityIndex * 15),
      fileCount: images.length,
    });
    try {
      onProgress?.({ phase: "planning", percent: 55, fileCount: files.length });
      const checksums = await Promise.all(files.map(sha256));
      const plan = await (dependencies.createPlan ?? createSourceDocumentUploadPlanAction)(
        _ledgerId,
        files.map((file, index) => ({
          contentType: file.type,
          byteSize: file.size,
          originalFilename: file.name,
          checksum: checksums[index]!,
        }))
      );
      let loadedBytes = 0;
      const totalBytes = files.reduce((total, file) => total + file.size, 0);
      for (const [index, target] of plan.targets.entries()) {
        const file = files[index]!;
        const response = await (dependencies.put ?? fetch)(target.url, {
          method: "PUT",
          headers: target.requiredHeaders,
          body: file,
        });
        if (!response.ok) throw new Error(`Direct upload failed with ${response.status}`);
        loadedBytes += file.size;
        onProgress?.({
          phase: "uploading",
          percent: 55 + Math.round((loadedBytes / totalBytes) * 30),
          loadedBytes,
          totalBytes,
          fileIndex: index,
          fileCount: files.length,
        });
      }
      onProgress?.({ phase: "finalizing", percent: 88, fileCount: files.length });
      const storedFileIds = await (dependencies.finalize ?? finalizeSourceDocumentUploadAction)(
        _ledgerId,
        {
          uploadSessionId: plan.id,
          finalizationToken: plan.finalizationToken,
          targetIds: plan.targets.map((target) => target.id),
        }
      );
      return {
        ...base,
        storedFileIds: [...(base.storedFileIds ?? []), ...storedFileIds],
      };
    } catch (error) {
      if (qualityIndex === QUALITY_STEPS.length - 1) {
        throw new SourceDocumentSubmissionUploadError("Failed to upload source image", "upload", {
          cause: error,
        });
      }
    }
  }

  throw new SourceDocumentSubmissionUploadError(
    "Images cannot be compressed within the 4 MiB request limit",
    "prepare"
  );
}
