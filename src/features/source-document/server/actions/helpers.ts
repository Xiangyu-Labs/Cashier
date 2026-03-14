"use server";

import { db } from "@/lib/db";
import { flowEngine } from "@/lib/flow";
import { TASK_TYPE_PARSE_SOURCE_DOCUMENT } from "../tasks/parse-source-document";
import type { Ledger } from "@/lib/db/schema";
import { getR2Storage, isR2Enabled } from "@/lib/storage/r2";
import { logger } from "@/lib/logger";
import { ValidationError } from "@/lib/errors";
import crypto from "crypto";

// Maximum file size: 10MB
const MAX_FILE_SIZE = 10 * 1024 * 1024;

/**
 * Process images: upload to R2 if enabled, otherwise normalize to base64
 */
export async function processImages(
    images: { data: string; mimeType: string }[] | undefined,
    ledgerId: string,
    sourceDocumentId: string
): Promise<string[]> {
    if (!images || images.length === 0) {
        return [];
    }

    const imageUrls: string[] = [];

    // Check if R2 is enabled
    if (isR2Enabled()) {
        const storage = getR2Storage();

        for (const img of images) {
            try {
                // Parse base64 data
                const base64Data = img.data.replace(/^data:image\/\w+;base64,/, "");
                const buffer = Buffer.from(base64Data, "base64");

                // Validate file size
                if (buffer.length > MAX_FILE_SIZE) {
                    throw new ValidationError(
                        `File too large: ${(buffer.length / 1024 / 1024).toFixed(2)}MB. Maximum allowed: ${MAX_FILE_SIZE / 1024 / 1024}MB`
                    );
                }

                // Generate unique key with proper extension based on mimeType
                const mimeToExt: Record<string, string> = {
                    "image/jpeg": "jpg",
                    "image/jpg": "jpg",
                    "image/png": "png",
                    "image/webp": "webp",
                    "image/gif": "gif",
                    "image/heic": "heic",
                    "image/heif": "heif",
                };
                const ext = mimeToExt[img.mimeType] || "jpg";
                const key = `${ledgerId}/${sourceDocumentId}/${crypto.randomUUID()}.${ext}`;

                // Upload to R2
                const url = await storage.upload(key, buffer, img.mimeType);
                imageUrls.push(url);

                logger.debug(
                    { key, size: buffer.length, mimeType: img.mimeType },
                    "Image uploaded to R2"
                );
            } catch (error) {
                logger.error({ error, sourceDocumentId }, "Failed to upload image to R2, falling back to base64");
                // Fallback: use base64
                imageUrls.push(img.data.startsWith("data:") ? img.data : `data:${img.mimeType};base64,${img.data}`);
            }
        }
    } else {
        // Legacy: normalize to base64
        for (const img of images) {
            let data = img.data;
            if (!data.startsWith("data:") && !data.startsWith("http")) {
                data = `data:${img.mimeType};base64,${data}`;
            }
            imageUrls.push(data);
        }
    }

    return imageUrls;
}

/**
 * Common logic to normalize images and prepare task data
 */
export async function prepareSourceDocumentTask(
    ledgerId: string,
    ledger: Ledger,
    text: string | undefined,
    images: { data: string; mimeType: string }[] | undefined,
    sourceDocumentId: string
): Promise<string[]> {
    const imageUrls = await processImages(images, ledgerId, sourceDocumentId);

    const categories = await db.query.entryCategories.findMany({
        where: (table, { eq, or, isNull, and }) => and(
            or(eq(table.ledgerId, ledgerId), isNull(table.ledgerId)),
            isNull(table.deletedAt)
        ),
        orderBy: (table, { asc }) => [asc(table.sortOrder), asc(table.id)]
    });

    const settings = ledger.metadata?.settings || {};

    await flowEngine.submit(
        TASK_TYPE_PARSE_SOURCE_DOCUMENT,
        {
            ledgerId: ledgerId,
            sourceDocumentId: sourceDocumentId,
            text: text,
            imageUrls: imageUrls,
            aiLanguage: settings.aiLanguage || "zh-CN",
            preferredCurrencies: settings.currencies || undefined,
            categories: categories,
            settings: {
                aiCustomPrompt: settings.aiCustomPrompt,
            },
        },
        {
            title: "解析单据",
            scopeId: ledgerId,
            entityType: 'source_document',
            entityId: sourceDocumentId,
        }
    );

    return imageUrls;
}
