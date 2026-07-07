/**
 * Receipt and invoice parser
 *
 * One AI call extracts validity, structured line items, receipt totals, and
 * order adjustments directly from images and/or text. No separate OCR stage.
 *
 * Uses a vision model when images are present, a text model for text-only input.
 * Downstream can run a second pass (dual-run) for complex documents.
 */

import type { AIContext } from "@/lib/tasks/types";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { isSuccessfulLoadImageResult, loadImagesForAI } from "@/lib/storage/utils";
import type { AIMessageContentPart } from "@/lib/tasks/types";
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
- Core accounting rule:
  - The receipt total should satisfy: sum(ledger_entries.amount) + sum(order_adjustments.amount) = receipt total.
  - Every monetary effect must appear exactly once.
  - Never represent the same discount, fee, tax, shipping charge, packaging fee, service fee, subsidy, or rounding adjustment in both ledger_entries and order_adjustments.
- ledger_entries:
  - ledger_entries are only the products or services the customer actually purchased.
  - The amount of each ledger_entry must be the final net amount for that specific item only.
  - If a discount or surcharge clearly applies to one specific item, fold it into that item's amount.
  - ledger_entry amounts must always be strictly positive (> 0); zero and negative values are invalid.
- order_adjustments:
  - order_adjustments are bill-level adjustments that modify the overall receipt total rather than one specific item.
  - Put bill-level discounts, coupons, spend-threshold promotions, shipping fees, packaging fees, service fees, taxes, tips, platform-wide subsidies, and rounding adjustments here.
  - If an adjustment cannot be confidently attributed to exactly one item, put it in order_adjustments instead of guessing how to distribute it across items.
  - Do not omit real bill-level charges just because they are not attached to a specific item.
  - Shipping fees, packaging fees, service fees, delivery fees, bag fees, taxes, tips, and other merchant/platform charges must be preserved when they affect the receipt total.
  - If the receipt explicitly shows one of these bill-level charges and it is not already included inside a specific item's amount, include it in order_adjustments rather than dropping it.
- Arithmetic / reconciliation rule:
  - Some receipts show a bill-level-looking discount line that is actually only the summary total of item-level discounts already reflected in the item prices.
  - Use simple arithmetic and receipt-total reconciliation to judge whether a displayed discount line is a true additional bill-level adjustment or merely a summary of item-level discounts.
  - If the displayed discount line is just the sum or recap of item-specific discounts already folded into ledger_entries, do not repeat it in order_adjustments.
  - Only include a discount in order_adjustments when it is an additional bill-level effect that is not already represented inside ledger_entries.
  - Conversely, for bill-level fees and charges such as shipping or packaging, do not ignore them during reconciliation: if they affect the final receipt total and are not already inside item amounts, they should appear in order_adjustments.
- Important special case:
  - Even if there is only one purchased item on the receipt, bill-level adjustments must still stay in order_adjustments.
  - Do not fold a bill-level discount or fee into the single item's amount just because there is only one item.
- This system only handles expenses. If the document is a refund or credit note, set outcome to "anomaly".
- Each receipt in a multi-receipt image gets its own receipt_index starting from 0.
- Examples:
  - Two items + order-level coupon: keep the item prices in ledger_entries, put the coupon in order_adjustments.
  - Two items + each item has its own discount: return the already-discounted item prices in ledger_entries, with no order_adjustments for those item-specific discounts.
  - Two items + item discounts of -10 and -20, plus a separate displayed "Discount -30" summary line: treat -30 as a summary only, not an extra order_adjustment.
  - One item + shipping fee + order-level coupon: keep only the item's own final price in ledger_entries, and put shipping fee / order-level coupon in order_adjustments.
  - Two items + packaging fee + delivery fee shown separately on the receipt: keep the item prices in ledger_entries, and include packaging fee / delivery fee in order_adjustments.
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
