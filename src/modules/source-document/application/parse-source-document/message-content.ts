/**
 * Shared message content builder for all pipeline stages.
 *
 * When documentUnderstanding is provided, images are replaced with a structured
 * evidence packet that preserves primary/secondary salience labels from Stage 0.
 * Falls back to visionDescription string if provided (legacy), or raw images.
 */

import type { DocumentUnderstanding } from "./types";

export type MessageContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

/**
 * Serialize structured DocumentUnderstanding into a compact labeled text packet.
 * Preserves primary/secondary distinction so downstream models can weight evidence.
 */
export function serializeDocumentUnderstanding(du: DocumentUnderstanding): string {
  const lines: string[] = [];

  lines.push(`[Document Understanding]
文档类型: ${du.documentType ?? "unknown"}`);

  lines.push(
    `\n主要证据 (Primary Evidence):
  商户/来源: ${du.primaryEvidence.merchant ?? "(未识别)"}
  合计金额: ${du.primaryEvidence.totals.join(", ") || "(未识别)"}
  货币: ${du.primaryEvidence.currencies.join(", ") || "(未识别)"}
  日期: ${du.primaryEvidence.dates.join(", ") || "(未识别)"}
  明细条目:\n${du.primaryEvidence.lineItems.map((l) => `    - ${l}`).join("\n") || "    (无明细)"}`
  );

  if (du.secondaryEvidence.length > 0) {
    lines.push(
      `\n次要信息 (Secondary Evidence):\n${du.secondaryEvidence.map((s) => `  - ${s}`).join("\n")}`
    );
  }

  if (du.ambiguities.length > 0) {
    lines.push(
      `\n不确定内容 (Ambiguities):\n${du.ambiguities.map((a) => `  - ${a}`).join("\n")}`
    );
  }

  if (du.salienceHints) {
    lines.push(`\n显著性提示 (Salience): ${du.salienceHints}`);
  }

  return lines.join("");
}

/**
 * Build message content for AI
 *
 * Combines user-provided text and AI-extracted image content with clear labeling.
 * Both sources are treated as equally valid inputs that may complement each other.
 *
 * This function operates on already-available image URLs or data URLs.
 */
export function buildMessageContent(
  text?: string,
  imageUrls?: string[],
  visionDescription?: string,
  documentUnderstanding?: DocumentUnderstanding
): MessageContentPart[] {
  const content: MessageContentPart[] = [];

  const hasUserText = text != null && text.trim() !== "";

  // Structured Stage 0 payload takes precedence over legacy string description
  const structuredPayload =
    documentUnderstanding != null
      ? serializeDocumentUnderstanding(documentUnderstanding)
      : null;

  const hasVisionContent =
    structuredPayload != null ||
    (visionDescription != null && visionDescription.trim() !== "");
  const visionText = structuredPayload ?? visionDescription ?? "";

  if (hasUserText && hasVisionContent) {
    content.push({
      type: "text",
      text: `用户直接提供的描述：\n${text}\n\nAI从图片识别的内容：\n${visionText}`,
    });
  } else if (hasUserText && (imageUrls?.length ?? 0) > 0) {
    content.push({ type: "text", text: `用户直接提供的描述：\n${text}` });
    for (const url of imageUrls ?? []) {
      content.push({ type: "image_url", image_url: { url } });
    }
  } else if (hasUserText) {
    content.push({ type: "text", text: `用户直接提供的描述：\n${text}` });
  } else if (hasVisionContent) {
    content.push({ type: "text", text: `AI从图片识别的内容：\n${visionText}` });
  } else if ((imageUrls?.length ?? 0) > 0) {
    for (const url of imageUrls ?? []) {
      content.push({ type: "image_url", image_url: { url } });
    }
  }

  return content.length > 0 ? content : [{ type: "text", text: "[No input provided]" }];
}
