import type {
  StoredFileContract,
  UploadFileRequestContract,
  UploadFinalizationContract,
  UploadPlanContract,
} from "@/application/contracts";
import { ValidationError } from "@/lib/errors";
import { MAX_ORIGINAL_BYTES_PER_FILE } from "@/lib/storage/upload-policy";
import { decodeBase64Image } from "@/modules/source-document/base64-image";
import { logger } from "@/lib/logger";

/**
 * Interface for the stored-files operations needed by prepareInlineImages.
 * This is a narrow local dependency shape — deliberately not the full
 * StoredFilePort so the helper stays testable without the rest of the
 * storage machinery.
 */
export interface InlineImageUploader {
  createUploadPlan(
    ledgerId: string,
    files: readonly UploadFileRequestContract[]
  ): Promise<UploadPlanContract>;
  uploadTarget(input: {
    ledgerId: string;
    uploadSessionId: string;
    targetId: string;
    contentType: string;
    body: Uint8Array;
  }): Promise<StoredFileContract>;
  finalizeUpload(input: UploadFinalizationContract): Promise<readonly StoredFileContract[]>;
  abandonUploadSession(ledgerId: string, uploadSessionId: string): Promise<void>;
}

export type ImageProcessor = (
  buffer: Buffer,
  mimeType: string
) => Promise<{ buffer: Buffer; mimeType: string }>;

/**
 * An inline image that is either still base64-encoded (web flow) or has
 * already been decoded once by the API v1 boundary (prepared flow). Both
 * variants share the same Sharp/S3/finalize pipeline.
 */
export type InlineImageSource =
  { data: string; mimeType: string } | { bytes: Buffer; mimeType: string };

const DEFAULT_MAX_DECODED_SIZE = MAX_ORIGINAL_BYTES_PER_FILE;

/**
 * Decode either a raw base64 string or a data:image URL into a Buffer.
 * Validates base64 correctness, MIME-type consistency, empty data, and max size.
 *
 * Throws ValidationError for any decode-level failure.
 */
function decodeImageData(data: string, mimeType: string, maxDecodedSize?: number): Buffer {
  const buffer = decodeBase64Image(data, mimeType).bytes;
  const effectiveMax = maxDecodedSize ?? DEFAULT_MAX_DECODED_SIZE;
  if (buffer.length > effectiveMax) {
    throw new ValidationError(
      `Decoded image data exceeds maximum size of ${effectiveMax / 1024 / 1024}MB`
    );
  }

  return buffer;
}

/**
 * Decode, process via sharp, upload to internal storage, and finalize a batch
 * of inline images. Returns the finalized stored-file IDs in the same order as
 * the input `images` array.
 *
 * Every image is decoded and processed before any upload begins, so a single
 * upload plan covers the exact processed size / content-type. If *any* image
 * fails to decode or process, no upload plan or durable state is created.
 */
export async function prepareInlineImages(
  images: InlineImageSource[],
  storedFiles: InlineImageUploader,
  processImage: ImageProcessor,
  ledgerId: string,
  maxDecodedBytes?: number
): Promise<{ storedFileIds: string[]; uploadSessionId: string }> {
  // Phase 1: decode and process all images (fail-fast if any is bad)
  const processedImages = await Promise.all(
    images.map(async (img) => {
      const rawBuffer =
        "bytes" in img ? img.bytes : decodeImageData(img.data, img.mimeType, maxDecodedBytes);
      const effectiveMax = maxDecodedBytes ?? DEFAULT_MAX_DECODED_SIZE;
      if (rawBuffer.length > effectiveMax) {
        throw new ValidationError(
          `Decoded image data exceeds maximum size of ${effectiveMax / 1024 / 1024}MB`
        );
      }
      const processed = await processImage(rawBuffer, img.mimeType);
      return { buffer: processed.buffer, mimeType: processed.mimeType };
    })
  );

  // Phase 2: create a single upload plan covering all images
  const plan = await storedFiles.createUploadPlan(
    ledgerId,
    processedImages.map((img) => ({
      contentType: img.mimeType,
      byteSize: img.buffer.length,
      originalFilename: null,
    }))
  );
  const abandon = async () => {
    try {
      await storedFiles.abandonUploadSession(ledgerId, plan.id);
    } catch {
      logger.error(
        { ledgerId, uploadSessionId: plan.id },
        "Failed to abandon source-document upload session"
      );
    }
  };
  try {
    if (plan.targets.length !== processedImages.length) {
      throw new ValidationError("Upload plan target count does not match the request");
    }
    await Promise.all(
      plan.targets.map(async (target, index) => {
        const processed = processedImages[index]!;
        await storedFiles.uploadTarget({
          ledgerId,
          uploadSessionId: plan.id,
          targetId: target.id,
          contentType: processed.mimeType,
          body: new Uint8Array(processed.buffer),
        });
      })
    );
    const finalized = await storedFiles.finalizeUpload({
      uploadSessionId: plan.id,
      finalizationToken: plan.finalizationToken,
      targetIds: plan.targets.map((t) => t.id),
    });
    if (finalized.length !== processedImages.length) {
      throw new ValidationError("Finalized file count does not match the request");
    }
    return { storedFileIds: finalized.map((file) => file.id), uploadSessionId: plan.id };
  } catch (error) {
    await abandon();
    throw error;
  }
}
