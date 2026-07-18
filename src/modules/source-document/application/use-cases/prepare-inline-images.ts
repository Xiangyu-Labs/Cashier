import type {
  StoredFileContract,
  UploadFileRequestContract,
  UploadFinalizationContract,
  UploadPlanContract,
} from "@/application/contracts";
import { ValidationError } from "@/lib/errors";
import { MAX_ORIGINAL_BYTES_PER_FILE } from "@/modules/source-document/upload-policy";

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
}

export type ImageProcessor = (
  buffer: Buffer,
  mimeType: string
) => Promise<{ buffer: Buffer; mimeType: string }>;

const DEFAULT_MAX_DECODED_SIZE = MAX_ORIGINAL_BYTES_PER_FILE;

/**
 * Decode either a raw base64 string or a data:image URL into a Buffer.
 * Validates base64 correctness, MIME-type consistency, empty data, and max size.
 *
 * Throws ValidationError for any decode-level failure.
 */
function decodeImageData(data: string, mimeType: string, maxDecodedSize?: number): Buffer {
  let base64Data = data;

  // Handle data:image/... URLs
  if (data.startsWith("data:")) {
    const match = data.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!match) {
      throw new ValidationError("Invalid image data URL format");
    }
    const urlMime = `image/${match[1]}`;
    if (urlMime !== mimeType) {
      throw new ValidationError(
        `MIME type mismatch between data URL (${urlMime}) and mimeType field (${mimeType})`
      );
    }
    base64Data = match[2]!;
  }

  // Strip whitespace — Buffer.from silently ignores it but our regex does not
  base64Data = base64Data.replace(/\s+/g, "");

  if (base64Data.length === 0) {
    throw new ValidationError("Image data is empty");
  }

  // Validate base64 encoding
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64Data)) {
    throw new ValidationError("Invalid base64 encoding in image data");
  }

  const buffer = Buffer.from(base64Data, "base64");
  if (buffer.length === 0) {
    throw new ValidationError("Decoded image data is empty");
  }

  // Safety net — schema already enforces this for published payloads
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
  images: Array<{ data: string; mimeType: string }>,
  storedFiles: InlineImageUploader,
  processImage: ImageProcessor,
  ledgerId: string,
  maxDecodedBytes?: number
): Promise<string[]> {
  // Phase 1: decode and process all images (fail-fast if any is bad)
  const processedImages = await Promise.all(
    images.map(async (img) => {
      const rawBuffer = decodeImageData(img.data, img.mimeType, maxDecodedBytes);
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

  // Phase 3: upload each target in parallel
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

  // Phase 4: finalize the upload session and return stored-file IDs
  const finalized = await storedFiles.finalizeUpload({
    uploadSessionId: plan.id,
    finalizationToken: plan.finalizationToken,
    targetIds: plan.targets.map((t) => t.id),
  });

  return finalized.map((f) => f.id);
}
