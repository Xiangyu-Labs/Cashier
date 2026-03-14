/**
 * Shared message content builder for all pipeline stages.
 *
 * When visionDescription is provided, images are replaced with the text description.
 * This is the key integration point for Stage 0 — downstream stages receive text
 * instead of raw images, allowing them to use cheap text-only models.
 */

import { loadImagesForAI } from "@/lib/storage/utils";

export type MessageContentPart =
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } };

/**
 * Build message content for AI
 *
 * Note: This is a synchronous function for backward compatibility.
 * When images need to be loaded from R2, use buildMessageContentAsync instead.
 */
export function buildMessageContent(
    text?: string,
    imageUrls?: string[],
    visionDescription?: string
): MessageContentPart[] {
    const content: MessageContentPart[] = [];

    if (text) {
        content.push({ type: "text", text });
    }

    if (visionDescription) {
        // Stage 0 description replaces raw images
        content.push({ type: "text", text: `[Document Description]\n${visionDescription}` });
    } else if (imageUrls?.length) {
        // Fallback: send raw images (when no vision model configured)
        // Note: Assumes images are already base64 or will be loaded by caller
        for (const url of imageUrls) {
            content.push({ type: "image_url", image_url: { url } });
        }
    }

    return content.length > 0 ? content : [{ type: "text", text: "[No input provided]" }];
}

/**
 * Async version that loads images from R2 if needed
 */
export async function buildMessageContentAsync(
    text?: string,
    imageUrls?: string[],
    visionDescription?: string
): Promise<MessageContentPart[]> {
    const content: MessageContentPart[] = [];

    if (text) {
        content.push({ type: "text", text });
    }

    if (visionDescription) {
        // Stage 0 description replaces raw images
        content.push({ type: "text", text: `[Document Description]\n${visionDescription}` });
    } else if (imageUrls?.length) {
        // Load images (handles both base64 and R2 URLs)
        const loadedUrls = await loadImagesForAI(imageUrls);
        for (const url of loadedUrls) {
            content.push({ type: "image_url", image_url: { url } });
        }
    }

    return content.length > 0 ? content : [{ type: "text", text: "[No input provided]" }];
}
