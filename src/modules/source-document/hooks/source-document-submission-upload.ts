"use client";

import {
  createSourceDocumentUploadPlanAction,
  finalizeSourceDocumentUploadAction,
} from "@/modules/source-document/actions";
import type { SourceDocumentSubmitPayload } from "./source-document-input-controller.types";
import {
  MAX_ORIGINAL_BYTES_PER_FILE,
  SUPPORTED_MIME_TYPES,
} from "@/modules/source-document/upload-policy";

interface SubmissionUploadDependencies {
  createPlan: typeof createSourceDocumentUploadPlanAction;
  finalize: typeof finalizeSourceDocumentUploadAction;
  fetch: typeof fetch;
  upload?: (
    target: { url: string; method: string; requiredHeaders: Readonly<Record<string, string>> },
    bytes: ArrayBuffer,
    onProgress: (loaded: number) => void
  ) => Promise<void>;
}

export type SourceDocumentSubmissionProgress =
  | { phase: "preparing" }
  | {
      phase: "uploading";
      loadedBytes: number;
      totalBytes: number;
      percent: number;
      fileIndex: number;
      fileCount: number;
    }
  | { phase: "finalizing" }
  | { phase: "submitting" };

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
  upload: uploadWithXhr,
};

function uploadWithXhr(
  target: { url: string; method: string; requiredHeaders: Readonly<Record<string, string>> },
  bytes: ArrayBuffer,
  onProgress: (loaded: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open(target.method, target.url);
    for (const [name, value] of Object.entries(target.requiredHeaders)) {
      request.setRequestHeader(name, value);
    }
    request.upload.onprogress = (event) => onProgress(event.loaded);
    request.onerror = () => reject(new Error("Source image upload failed"));
    request.onabort = () => reject(new Error("Source image upload was aborted"));
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) resolve();
      else reject(new Error(`Source image upload returned HTTP ${request.status}`));
    };
    request.send(bytes);
  });
}

function withoutInlineImages(payload: SourceDocumentSubmitPayload): SourceDocumentSubmitPayload {
  const submission: SourceDocumentSubmitPayload = { entryDate: payload.entryDate };
  if (payload.text !== undefined) submission.text = payload.text;
  if (payload.storedFileIds !== undefined) submission.storedFileIds = payload.storedFileIds;
  return submission;
}

// Build data URL pattern from the shared policy MIME list
const IMAGE_MIME_PATTERN = SUPPORTED_MIME_TYPES.map((t) =>
  t.replace("image/", "").replace(/[.+*?^${}()|[\]\\]/g, "\\$&")
).join("|");
const IMAGE_DATA_URL_PATTERN = new RegExp(
  `^data:(image/(?:${IMAGE_MIME_PATTERN}));base64,([a-z\\d+/]*={0,2})$`,
  "i"
);
const MAX_IMAGE_BYTES = MAX_ORIGINAL_BYTES_PER_FILE;

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

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

export async function uploadSourceDocumentSubmissionImages(
  ledgerId: string,
  payload: SourceDocumentSubmitPayload,
  dependencies: SubmissionUploadDependencies = defaultDependencies,
  onProgress?: (progress: SourceDocumentSubmissionProgress) => void
): Promise<SourceDocumentSubmitPayload> {
  const images = payload.images ?? [];
  if (images.length === 0) return withoutInlineImages(payload);

  onProgress?.({ phase: "preparing" });

  let prepared: Array<{ bytes: ArrayBuffer; contentType: string; checksum: string }>;
  try {
    prepared = await Promise.all(
      images.map(async (image) => {
        const decoded = decodeImageDataUrl(image.data);
        return { ...decoded, checksum: await sha256Hex(decoded.bytes) };
      })
    );
  } catch (error) {
    if (error instanceof SourceDocumentSubmissionUploadError) throw error;
    throw new SourceDocumentSubmissionUploadError("Failed to checksum source image", "prepare", {
      cause: error,
    });
  }
  let plan: Awaited<ReturnType<SubmissionUploadDependencies["createPlan"]>>;
  try {
    plan = await dependencies.createPlan(
      ledgerId,
      prepared.map((file) => ({
        contentType: file.contentType,
        byteSize: file.bytes.byteLength,
        originalFilename: null,
        checksum: file.checksum,
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
    const loadedByFile = prepared.map(() => 0);
    const totalBytes = prepared.reduce((sum, file) => sum + file.bytes.byteLength, 0);
    await Promise.all(
      plan.targets.map(async (target, index) => {
        const bytes = prepared[index]!.bytes;
        const report = (loaded: number) => {
          loadedByFile[index] = Math.min(loaded, bytes.byteLength);
          const loadedBytes = loadedByFile.reduce((sum, value) => sum + value, 0);
          onProgress?.({
            phase: "uploading",
            loadedBytes,
            totalBytes,
            percent: totalBytes === 0 ? 0 : Math.round((loadedBytes / totalBytes) * 100),
            fileIndex: index + 1,
            fileCount: prepared.length,
          });
        };
        report(0);
        if (dependencies.upload != null) {
          await dependencies.upload(target, bytes, report);
          report(bytes.byteLength);
        } else {
          const response = await dependencies.fetch(target.url, {
            method: target.method,
            headers: target.requiredHeaders,
            body: bytes,
          });
          if (!response.ok) {
            throw new Error(`Source image upload returned HTTP ${response.status}`);
          }
          report(bytes.byteLength);
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
    onProgress?.({ phase: "finalizing" });
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
