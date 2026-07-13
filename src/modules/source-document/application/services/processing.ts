import crypto from "crypto";
import type { CategoryInfo } from "@/lib/ai/types";
import { ValidationError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { processImage, isSupportedImageFormat } from "@/lib/storage/image-processing";
import { listEntryCategoryInfos } from "@/modules/ledger/source-document-queries";
import type { Ledger } from "@/persistence";
import { TASK_TYPE_PARSE_SOURCE_DOCUMENT } from "../tasks/parse-source-document";
import {
  createCurrentProcessingPort,
  createProcessingIntent,
  storeLocalFile,
} from "@/application/contracts/current-runtime";

interface SourceDocumentTaskSettings {
  aiLanguage: string;
  preferredCurrencies?: string[];
  settings: {
    aiCustomPrompt?: string;
  };
}

export interface SourceDocumentTaskContext {
  categories: CategoryInfo[];
  settings: SourceDocumentTaskSettings;
}

interface PrepareSourceDocumentTaskInput {
  ledgerId: string;
  sourceDocumentId: string;
  text?: string;
  imageUrls: string[];
  categories: CategoryInfo[];
  settings: SourceDocumentTaskSettings;
}

// Maximum file size: 10MB (before compression)
const MAX_FILE_SIZE = 10 * 1024 * 1024;
// Maximum file size after compression: 5MB
const MAX_COMPRESSED_FILE_SIZE = 5 * 1024 * 1024;

export async function getSourceDocumentTaskContext(
  ledgerId: string,
  ledger: Ledger
): Promise<SourceDocumentTaskContext> {
  const categories = await listEntryCategoryInfos(ledgerId);

  const ledgerSettings = ledger.metadata?.settings ?? {};
  const preferredCurrencies = ledgerSettings.currencies;
  const aiCustomPrompt = ledgerSettings.aiCustomPrompt;

  return {
    categories,
    settings: {
      aiLanguage: ledgerSettings.aiLanguage ?? "zh-CN",
      ...(preferredCurrencies !== undefined ? { preferredCurrencies } : {}),
      settings: {
        ...(aiCustomPrompt !== undefined ? { aiCustomPrompt } : {}),
      },
    },
  };
}

export async function processImages(
  images: { data: string; mimeType: string }[] | undefined,
  ledgerId: string,
  sourceDocumentId: string
): Promise<string[]> {
  if (images == null || images.length === 0) {
    return [];
  }

  const imageUrls: string[] = [];

  const mimeToExt: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/heic": "heic",
    "image/heif": "heif",
    "image/avif": "avif",
  };

  for (const img of images) {
    if (
      img.data.startsWith("http://") ||
      img.data.startsWith("https://") ||
      img.data.startsWith("/api/uploads/")
    ) {
      imageUrls.push(img.data);
      continue;
    }

    const base64Data = img.data.startsWith("data:")
      ? img.data.replace(/^data:image\/[^;]+;base64,/, "")
      : img.data;
    const buffer = Buffer.from(base64Data, "base64");

    if (buffer.length > MAX_FILE_SIZE) {
      throw new ValidationError(
        `File too large: ${(buffer.length / 1024 / 1024).toFixed(2)}MB. Maximum allowed: ${MAX_FILE_SIZE / 1024 / 1024}MB`
      );
    }

    let processedBuffer = buffer;
    let outputMimeType = img.mimeType;

    if (isSupportedImageFormat(img.mimeType) && !img.mimeType.includes("svg")) {
      const processed = await processImage(buffer, img.mimeType, {
        maxDimension: 2048,
        quality: 85,
        format: "auto",
        stripMetadata: true,
      });
      processedBuffer = Buffer.from(processed.buffer);
      outputMimeType = processed.mimeType;

      logger.debug(
        {
          originalSize: buffer.length,
          processedSize: processedBuffer.length,
          originalMime: img.mimeType,
          outputMime: outputMimeType,
        },
        "Image compressed"
      );
    }

    if (processedBuffer.length > MAX_COMPRESSED_FILE_SIZE) {
      throw new ValidationError(
        `Compressed file still too large: ${(processedBuffer.length / 1024 / 1024).toFixed(2)}MB. Maximum allowed: ${MAX_COMPRESSED_FILE_SIZE / 1024 / 1024}MB`
      );
    }

    const ext = mimeToExt[outputMimeType] ?? "jpg";
    const key = `${ledgerId}/${sourceDocumentId}/${crypto.randomUUID()}.${ext}`;
    const stored = await storeLocalFile({
      ledgerId,
      key,
      bytes: processedBuffer,
      metadata: {
        contentType: outputMimeType,
        byteSize: processedBuffer.length,
        originalFilename: null,
        checksum: null,
      },
    });
    // image_urls remains the temporary compatibility projection until task 4 adds stored_files.
    imageUrls.push(stored.legacyReadUrl);

    logger.debug(
      {
        key,
        originalSize: buffer.length,
        processedSize: processedBuffer.length,
        originalMime: img.mimeType,
        outputMime: outputMimeType,
      },
      "Image uploaded to local storage"
    );
  }

  return imageUrls;
}

export async function prepareSourceDocumentTask({
  ledgerId,
  sourceDocumentId,
  text,
  imageUrls,
  categories,
  settings,
}: PrepareSourceDocumentTaskInput): Promise<void> {
  const intent = createProcessingIntent({ sourceDocumentId });
  const processing = createCurrentProcessingPort({
    taskType: TASK_TYPE_PARSE_SOURCE_DOCUMENT,
    toTaskInput: () => ({
      ledgerId,
      sourceDocumentId,
      imageUrls,
      aiLanguage: settings.aiLanguage,
      categories,
      settings: settings.settings,
      ...(text !== undefined ? { text } : {}),
      ...(settings.preferredCurrencies !== undefined
        ? { preferredCurrencies: settings.preferredCurrencies }
        : {}),
    }),
    metadata: (currentIntent) => ({
      title: "Parse source document",
      scopeId: ledgerId,
      entityType: "source_document",
      entityId: sourceDocumentId,
      deduplicationKey: `parse:${currentIntent.revisionId}:${currentIntent.attempt}`,
    }),
  });
  await processing.dispatch(intent);
}
