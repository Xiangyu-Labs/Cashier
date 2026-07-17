"use client";

import {
  createSourceDocumentUploadPlanAction,
  finalizeSourceDocumentUploadAction,
} from "@/modules/source-document/actions";
import type { SourceDocumentSubmitPayload } from "./source-document-input-controller.types";

interface SubmissionUploadDependencies {
  createPlan: typeof createSourceDocumentUploadPlanAction;
  finalize: typeof finalizeSourceDocumentUploadAction;
  fetch: typeof fetch;
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

const defaultDependencies: SubmissionUploadDependencies = {
  createPlan: createSourceDocumentUploadPlanAction,
  finalize: finalizeSourceDocumentUploadAction,
  fetch: (input, init) => globalThis.fetch(input, init),
};

function withoutInlineImages(payload: SourceDocumentSubmitPayload): SourceDocumentSubmitPayload {
  const submission: SourceDocumentSubmitPayload = { entryDate: payload.entryDate };
  if (payload.text !== undefined) submission.text = payload.text;
  if (payload.storedFileIds !== undefined) submission.storedFileIds = payload.storedFileIds;
  return submission;
}

const IMAGE_DATA_URL_PATTERN = /^data:(image\/(?:jpeg|png|gif|webp));base64,([a-z\d+/]*={0,2})$/i;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

function decodeImageDataUrl(dataUrl: string): { bytes: ArrayBuffer; contentType: string } {
  const match = IMAGE_DATA_URL_PATTERN.exec(dataUrl);
  if (match == null) {
    throw new SourceDocumentSubmissionUploadError(
      "Source image is not a supported image data URL",
      "prepare"
    );
  }

  try {
    const binary = atob(match[2]!);
    if (binary.length === 0 || binary.length > MAX_IMAGE_BYTES) {
      throw new SourceDocumentSubmissionUploadError(
        "Source image is empty or exceeds the upload limit",
        "prepare"
      );
    }

    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return { bytes: bytes.buffer, contentType: match[1]!.toLowerCase() };
  } catch (error) {
    if (error instanceof SourceDocumentSubmissionUploadError) throw error;
    throw new SourceDocumentSubmissionUploadError("Failed to decode source image", "prepare", {
      cause: error,
    });
  }
}

export async function uploadSourceDocumentSubmissionImages(
  ledgerId: string,
  payload: SourceDocumentSubmitPayload,
  dependencies: SubmissionUploadDependencies = defaultDependencies
): Promise<SourceDocumentSubmitPayload> {
  const images = payload.images ?? [];
  if (images.length === 0) return withoutInlineImages(payload);

  const prepared = images.map((image) => decodeImageDataUrl(image.data));
  let plan: Awaited<ReturnType<SubmissionUploadDependencies["createPlan"]>>;
  try {
    plan = await dependencies.createPlan(
      ledgerId,
      prepared.map((file) => ({
        contentType: file.contentType,
        byteSize: file.bytes.byteLength,
        originalFilename: null,
      }))
    );
  } catch (error) {
    throw new SourceDocumentSubmissionUploadError(
      "Failed to create source image upload plan",
      "plan",
      { cause: error }
    );
  }
  if (plan.targets.length !== prepared.length) {
    throw new SourceDocumentSubmissionUploadError(
      "Upload plan did not contain all requested targets",
      "plan"
    );
  }

  try {
    await Promise.all(
      plan.targets.map(async (target, index) => {
        const response = await dependencies.fetch(target.url, {
          method: target.method,
          headers: target.requiredHeaders,
          body: prepared[index]!.bytes,
        });
        if (!response.ok) {
          throw new Error(`Source image upload returned HTTP ${response.status}`);
        }
      })
    );
  } catch (error) {
    throw new SourceDocumentSubmissionUploadError("Failed to upload source image", "upload", {
      cause: error,
    });
  }

  let storedFileIds: string[];
  try {
    storedFileIds = await dependencies.finalize(ledgerId, {
      uploadSessionId: plan.id,
      finalizationToken: plan.finalizationToken,
      targetIds: plan.targets.map((target) => target.id),
    });
  } catch (error) {
    throw new SourceDocumentSubmissionUploadError(
      "Failed to finalize source image upload",
      "finalize",
      { cause: error }
    );
  }
  return {
    ...withoutInlineImages(payload),
    storedFileIds: [...(payload.storedFileIds ?? []), ...storedFileIds],
  };
}
