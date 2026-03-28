/**
 * Stage 0: Single-pass receipt and invoice parser
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
import { loadImagesForAI } from "@/lib/storage/utils";
import {
  stage0ParseOutputSchema,
  normalizeResult,
  type NormalizedStage0ParseOutput,
} from "./stage0-schema";

export interface Stage0Input {
  imageUrls?: string[];
  text?: string;
  originalCategories: { name: string; description?: string | null }[];
  aiLanguage?: string;
  aiCustomPrompt?: string;
  preferredCurrencies?: string[];
  documentUnderstanding?: unknown; // accepted but not used in single-pass path
}

export type Stage0Output = NormalizedStage0ParseOutput;

function buildPrompt(
  input: Stage0Input,
  aiLanguage: string
): string {
  const categorySection =
    input.originalCategories.length > 0
      ? `\n### Expense Categories\nAssign each line item a category_index (0-based) from this list:\n${input.originalCategories
          .map((c, i) => `${i}. ${c.name}${c.description != null && c.description !== "" ? ` — ${c.description}` : ""}`)
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
- Use negative amounts for discounts and adjustments in order_adjustments.
- Each receipt in a multi-receipt image gets its own receipt_index starting from 0.
- Do not include taxes or tips in order_adjustments; include them as ledger_entries.
- Return only the JSON block, no other text.`;
}

export async function executeStage0(
  input: Stage0Input,
  ai: AIContext
): Promise<Stage0Output> {
  const aiLanguage = input.aiLanguage ?? "zh-CN";
  const hasImages = (input.imageUrls?.length ?? 0) > 0;
  const model = hasImages ? "vision" : "text";

  const prompt = buildPrompt(input, aiLanguage);

  let images: { dataUrl: string }[] | undefined;
  if (hasImages) {
    const loaded = await loadImagesForAI(input.imageUrls!);
    images = loaded
      .filter((r) => r.success)
      .map((r) => ({ dataUrl: r.dataUrl }));
  }

  logger.debug({ model, hasImages }, "stage0: calling AI");

  const response = await ai.generate({ model, prompt, images });

  let raw: unknown;
  try {
    // Strip markdown fences if present
    const content = response.content
      .replace(/^```json\s*/m, "")
      .replace(/```\s*$/m, "")
      .trim();
    raw = JSON.parse(content);
  } catch (e) {
    throw new AppError(
      `stage0: failed to parse AI response as JSON: ${String(e)}`,
      "AI_PARSE_ERROR"
    );
  }

  const parsed = stage0ParseOutputSchema.safeParse(raw);
  if (!parsed.success) {
    throw new AppError(
      `stage0: AI response failed schema validation: ${parsed.error.message}`,
      "AI_SCHEMA_ERROR"
    );
  }

  const result = normalizeResult(parsed.data);
  logger.debug({ outcome: result.outcome, entries: result.ledger_entries.length }, "stage0: complete");
  return result;
}
