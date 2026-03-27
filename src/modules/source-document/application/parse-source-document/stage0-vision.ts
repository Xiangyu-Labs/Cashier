/**
 * Stage 0: Structured Document Understanding
 *
 * Produces a compact, structured "document understanding" payload that separates
 * primary evidence (amounts, line items, merchant, dates) from secondary evidence
 * (footer text, promotional copy) and encodes salience, ambiguity, and confidence.
 *
 * Downstream stages receive this structured payload instead of raw images or verbose
 * freeform narration, allowing cheaper text-only models while preserving the
 * primary-vs-secondary distinction needed for conflict resolution.
 */

import type { AIContext } from "@/lib/flow/types";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { loadImagesForAI } from "@/lib/storage/utils";
import type { DocumentUnderstanding } from "./types";

export interface Stage0Input {
  imageUrls: string[];
  focusHints?: string[];
  aiLanguage?: string;
}

export type Stage0Output = DocumentUnderstanding;

/** Returned when there are no images to process */
const EMPTY_UNDERSTANDING: DocumentUnderstanding = {
  documentType: null,
  primaryEvidence: {
    merchant: null,
    totals: [],
    currencies: [],
    dates: [],
    lineItems: [],
  },
  secondaryEvidence: [],
  ambiguities: [],
  salienceHints: "",
};

function buildVisionPrompt(aiLanguage: string = "zh-CN", focusHints?: string[]): string {
  const focusSection =
    (focusHints?.length ?? 0) > 0
      ? `\n### Focus Areas\nPay special attention to:\n${(focusHints ?? []).map((h) => `- ${h}`).join("\n")}\n`
      : "";

  return `You are a financial document understanding AI. Your job is to extract structured evidence from the document image(s) and classify it by salience — separating essential financial data from decorative or secondary text.

Respond in the user's preferred language when naming things (language: ${aiLanguage}), but keep field names and JSON keys in English.

### Output Format

Return a single JSON object with this exact shape:

\`\`\`json
{
  "documentType": "receipt | invoice | bank_statement | screenshot | handwritten | unknown",
  "primaryEvidence": {
    "merchant": "<store/brand name, or null if absent>",
    "totals": ["<each total/grand-total amount exactly as printed, e.g. ¥45.00>"],
    "currencies": ["<ISO code or symbol, e.g. CNY, USD, ¥, $>"],
    "dates": ["<transaction or document dates>"],
    "lineItems": ["<item name: amount — list each individually, max 30 items>"]
  },
  "secondaryEvidence": [
    "<non-financial text: addresses, phone numbers, promo text, footer copy, thank-you notes — max 10 items>"
  ],
  "ambiguities": [
    "<anything blurry, partially cut off, or where you are uncertain — describe what you can see>"
  ],
  "salienceHints": "<one sentence: where are the most important values located on the document?>"
}
\`\`\`

### Rules

- primaryEvidence = financial data that drives ledger entries (amounts, items, merchant, dates)
- secondaryEvidence = everything else visible but not directly relevant to the ledger
- Do NOT merge primary and secondary into one flat list
- Keep lists compact — prefer concise item descriptions over verbose transcription
- If a field has no data, use null (for strings) or [] (for arrays)
- Do NOT add explanatory prose outside the JSON${focusSection}`;
}

export async function executeStage0(
  input: Stage0Input,
  ai: AIContext
): Promise<Stage0Output> {
  if (input.imageUrls.length === 0) {
    return EMPTY_UNDERSTANDING;
  }

  const prompt = buildVisionPrompt(input.aiLanguage, input.focusHints);

  const content: Array<
    { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }
  > = [];

  if (input.imageUrls.length > 1) {
    content.push({
      type: "text",
      text: `This document consists of ${input.imageUrls.length} images. Analyze all of them as a single document.`,
    });
  }

  // Load images (handles both base64 and R2 URLs)
  const loadedResults = await loadImagesForAI(input.imageUrls);
  const failures = loadedResults.filter((r) => !r.success);
  if (failures.length > 0) {
    const failureMessages = failures.map((f) => `${f.url}: ${f.error?.message}`).join("; ");
    throw new AppError(
      `Failed to load ${failures.length} image(s): ${failureMessages}`,
      "IMAGE_BATCH_LOAD_FAILED"
    );
  }

  for (const result of loadedResults) {
    if (result.dataUrl != null && result.dataUrl !== "") {
      content.push({ type: "image_url", image_url: { url: result.dataUrl } });
    }
  }

  const response = await ai.generate({
    prompt,
    messages: [{ role: "user", content }],
    model: "vision",
    requireJson: true,
  });

  const parsed = JSON.parse(response.content) as DocumentUnderstanding;

  logger.info(
    {
      documentType: parsed.documentType,
      primaryLineItems: parsed.primaryEvidence?.lineItems?.length ?? 0,
      secondaryItems: parsed.secondaryEvidence?.length ?? 0,
      ambiguities: parsed.ambiguities?.length ?? 0,
    },
    "Stage 0: Document understanding completed"
  );

  return parsed;
}
