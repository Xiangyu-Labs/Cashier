/**
 * Receipt and invoice parser
 *
 * One AI call extracts validity, structured line items, receipt totals, and
 * order adjustments directly from images and/or text. No separate OCR stage.
 *
 * Uses a vision model when images are present, a text model for text-only input.
 * Downstream can run a second pass (dual-run) for complex documents.
 */

import type { AIContext } from "@/lib/flow/types";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { isSuccessfulLoadImageResult, loadImagesForAI } from "@/lib/storage/utils";
import type { AIMessageContentPart } from "@/lib/flow/types";
import {
  parserOutputSchema,
  normalizeResult,
  type NormalizedParseOutput,
} from "./parser-schema";

export interface ParserInput {
  imageUrls?: string[];
  text?: string;
  originalCategories: { name: string; description?: string | null }[];
  aiLanguage?: string;
  aiCustomPrompt?: string;
  preferredCurrencies?: string[];
}

function buildMessageContent(
  images: { dataUrl: string }[] | undefined
): AIMessageContentPart[] {
  const content: AIMessageContentPart[] = [
    { type: "text", text: "Please parse this source document." },
  ];

  if (images != null) {
    content.push(
      ...images.map((image) => ({
        type: "image_url" as const,
        image_url: { url: image.dataUrl },
      }))
    );
  }

  return content;
}

function buildPrompt(
  input: ParserInput,
  aiLanguage: string
): string {
  const categorySection =
    input.originalCategories.length > 0
      ? `\n### Expense Categories\nAssign each line item a category_index from this list. Use 0 if no category fits:\n${input.originalCategories
          .map((c, i) => `${i + 1}. ${c.name}${c.description != null && c.description !== "" ? ` — ${c.description}` : ""}`)
          .join("\n")}\n`
      : "\n### Expense Categories\nNo categories provided — use category_index 0 for all entries.\n";

  const currencySection =
    (input.preferredCurrencies?.length ?? 0) > 0
      ? `\n### Preferred Currencies\nWhen currency is ambiguous, prefer: ${input.preferredCurrencies!.join(", ")}\n`
      : "";

  const customSection = input.aiCustomPrompt != null && input.aiCustomPrompt !== ""
    ? `\n### Additional Instructions\n${input.aiCustomPrompt}\n`
    : "";

  const textSection = input.text != null && input.text !== ""
    ? `\n### Document Text\n${input.text}\n`
    : "";

  return `You are a receipt and invoice parser. Extract all expense line items from the provided document(s) and return structured JSON.

Respond in the user's preferred language for item names (language: ${aiLanguage}), but keep all JSON keys in English.
${categorySection}${currencySection}${customSection}${textSection}
### Output Format

Return a single JSON object:

\`\`\`json
{
  "outcome": "success | invalid | anomaly",
  "anomaly_reason": "string or null — only when outcome is anomaly",
  "title": "merchant or document name",
  "receipt_count": 1,
  "receipt_totals": [
    { "receipt_index": 0, "amount": 45.00, "currency": "CNY" }
  ],
  "ledger_entries": [
    {
      "receipt_index": 0,
      "item_name": "Lunch set",
      "amount": 45.00,
      "currency": "CNY",
      "category_index": 1,
      "notes": null
    }
  ],
  "order_adjustments": [
    { "receipt_index": 0, "item_name": "Discount", "amount": -5.00, "currency": "CNY" }
  ],
  "reasoning": "brief explanation"
}
\`\`\`

### Rules
- Set outcome to "invalid" if the document is not a receipt or invoice.
- Set outcome to "anomaly" if the document is a receipt but cannot be reliably parsed (e.g. blurry, torn, missing totals). Include anomaly_reason.
- ledger_entries: items the customer actively chose to purchase (products or services received). Always record the final net price — if an item has an individual discount, fold it into the amount. ledger_entry amounts must always be strictly positive (> 0); zero and negative values are invalid.
- order_adjustments: everything else that modifies the bill total — any fee, charge, tax, deduction, or rounding applied by the merchant or system, regardless of what it is called. Use negative amounts for reductions.
- This system only handles expenses. If the document is a refund or credit note, set outcome to "anomaly".
- Each receipt in a multi-receipt image gets its own receipt_index starting from 0.
- Return only the JSON block, no other text.`;
}

export async function executeParser(
  input: ParserInput,
  ai: AIContext
): Promise<NormalizedParseOutput> {
  const aiLanguage = input.aiLanguage ?? "zh-CN";
  const hasImages = (input.imageUrls?.length ?? 0) > 0;
  const model = hasImages ? "vision" : "text";

  const prompt = buildPrompt(input, aiLanguage);

  let images: { dataUrl: string }[] | undefined;
  if (hasImages) {
    const loaded = await loadImagesForAI(input.imageUrls!);
    images = loaded
      .filter(isSuccessfulLoadImageResult)
      .map((r) => ({ dataUrl: r.dataUrl }));
  }

  logger.debug({ model, hasImages }, "parser: calling AI");

  const response = await ai.generate({
    model,
    prompt,
    messages: [{ role: "user", content: buildMessageContent(images) }],
  });

  let raw: unknown;
  try {
    const content = response.content
      .replace(/^```json\s*/m, "")
      .replace(/```\s*$/m, "")
      .trim();
    raw = JSON.parse(content);
  } catch (e) {
    throw new AppError(
      `parser: failed to parse AI response as JSON: ${String(e)}`,
      "AI_PARSE_ERROR"
    );
  }

  const parsed = parserOutputSchema.safeParse(raw);
  if (!parsed.success) {
    throw new AppError(
      `parser: AI response failed schema validation: ${parsed.error.message}`,
      "AI_SCHEMA_ERROR"
    );
  }

  const result = normalizeResult(parsed.data);
  logger.debug({ outcome: result.outcome, entries: result.ledger_entries.length }, "parser: complete");
  return result;
}
