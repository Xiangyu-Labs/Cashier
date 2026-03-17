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
 * Combines user-provided text and AI-extracted image content with clear labeling.
 * Both sources are treated as equally valid inputs that may complement each other.
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

  // Determine which sources are available
  const hasUserText = text != null && text.trim() !== "";
  const hasVisionDescription = visionDescription != null && visionDescription.trim() !== "";

  if (hasUserText && hasVisionDescription) {
    // Both sources available - present as complementary inputs in a single text
    content.push({
      type: "text",
      text: `用户直接提供的描述：\n${text}\n\nAI从图片识别的内容：\n${visionDescription}`,
    });
  } else if (hasUserText && (imageUrls?.length ?? 0) > 0) {
    // User text + raw images (no vision description yet) - send as separate parts
    content.push({
      type: "text",
      text: `用户直接提供的描述：\n${text}`,
    });
    for (const url of imageUrls) {
      content.push({ type: "image_url", image_url: { url } });
    }
  } else if (hasUserText) {
    // Only user text
    content.push({
      type: "text",
      text: `用户直接提供的描述：\n${text}`,
    });
  } else if (hasVisionDescription) {
    // Only AI vision description
    content.push({
      type: "text",
      text: `AI从图片识别的内容：\n${visionDescription}`,
    });
  } else if ((imageUrls?.length ?? 0) > 0) {
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

  // Determine which sources are available
  const hasUserText = text != null && text.trim() !== "";
  const hasVisionDescription = visionDescription != null && visionDescription.trim() !== "";

  if (hasUserText && hasVisionDescription) {
    // Both sources available - present as complementary inputs in a single text
    content.push({
      type: "text",
      text: `用户直接提供的描述：\n${text}\n\nAI从图片识别的内容：\n${visionDescription}`,
    });
  } else if (hasUserText && (imageUrls?.length ?? 0) > 0) {
    // User text + raw images (no vision description yet) - send as separate parts
    content.push({
      type: "text",
      text: `用户直接提供的描述：\n${text}`,
    });
    const loadedResults = await loadImagesForAI(imageUrls);
    const failures = loadedResults.filter((r) => !r.success);
    if (failures.length > 0) {
      const failureMessages = failures.map((f) => `${f.url}: ${f.error?.message}`).join("; ");
      throw new Error(`Failed to load ${failures.length} image(s): ${failureMessages}`);
    }
    for (const result of loadedResults) {
      if (result.dataUrl) {
        content.push({ type: "image_url", image_url: { url: result.dataUrl } });
      }
    }
  } else if (hasUserText) {
    // Only user text
    content.push({
      type: "text",
      text: `用户直接提供的描述：\n${text}`,
    });
  } else if (hasVisionDescription) {
    // Only AI vision description
    content.push({
      type: "text",
      text: `AI从图片识别的内容：\n${visionDescription}`,
    });
  } else if ((imageUrls?.length ?? 0) > 0) {
    // Load images (handles both base64 and R2 URLs)
    const loadedResults = await loadImagesForAI(imageUrls);
    const failures = loadedResults.filter((r) => !r.success);
    if (failures.length > 0) {
      const failureMessages = failures.map((f) => `${f.url}: ${f.error?.message}`).join("; ");
      throw new Error(`Failed to load ${failures.length} image(s): ${failureMessages}`);
    }
    for (const result of loadedResults) {
      if (result.dataUrl) {
        content.push({ type: "image_url", image_url: { url: result.dataUrl } });
      }
    }
  }

  return content.length > 0 ? content : [{ type: "text", text: "[No input provided]" }];
}
