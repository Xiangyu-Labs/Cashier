/**
 * Shared message content builder for all pipeline stages.
 *
 * When visionDescription is provided, images are replaced with the text description.
 * This is the key integration point for Stage 0 — downstream stages receive text
 * instead of raw images, allowing them to use cheap text-only models.
 */

export type MessageContentPart =
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } };

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
        for (const url of imageUrls) {
            content.push({ type: "image_url", image_url: { url } });
        }
    }

    return content.length > 0 ? content : [{ type: "text", text: "[No input provided]" }];
}
