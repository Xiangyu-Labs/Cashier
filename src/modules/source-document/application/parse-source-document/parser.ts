/**
 * Receipt and invoice parser
 *
 * One AI call extracts validity, structured line items, receipt totals, and
 * order adjustments directly from images and/or text. No separate OCR stage.
 *
 * Uses a vision model when images are present, a text model for text-only input.
 * Downstream can run a second pass (dual-run) for complex documents.
 */

import { logger } from "@/lib/logger";
import { buildAiOutputLocaleInstruction } from "@/config/ai-output-locales";
import {
  ProcessingCancelledError,
  ProcessingFailure,
  type AiContextContract,
  type AiMessageContentPart as AIMessageContentPart,
} from "./contracts";
import { parserOutputSchema, normalizeResult, type NormalizedParseOutput } from "./parser-schema";
import { TITLE_POLICY_PROMPT } from "@/modules/source-document/title-policy";

export interface ParserInput {
  evidence?: { images: readonly { dataUrl: string }[] };
  text?: string;
  originalCategories: { name: string; description?: string | null }[];
  aiLanguage?: string;
  aiCustomPrompt?: string;
  preferredCurrencies?: string[];
}

function buildMessageContent(
  images: readonly { dataUrl: string }[] | undefined
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

function buildPrompt(input: ParserInput, aiLanguage: string): string {
  const categorySection =
    input.originalCategories.length > 0
      ? `\n### Expense Categories\nAssign each line item a category_index from this list. Use 0 if no category fits:\n${input.originalCategories
          .map(
            (c, i) =>
              `${i + 1}. ${c.name}${c.description != null && c.description !== "" ? ` — ${c.description}` : ""}`
          )
          .join("\n")}\n`
      : "\n### Expense Categories\nNo categories provided — use category_index 0 for all entries.\n";

  const currencySection =
    (input.preferredCurrencies?.length ?? 0) > 0
      ? `\n### Preferred Currencies\nWhen currency is ambiguous, prefer: ${input.preferredCurrencies!.join(", ")}\n`
      : "";

  const customSection =
    input.aiCustomPrompt != null && input.aiCustomPrompt !== ""
      ? `\n### Additional Instructions\n${input.aiCustomPrompt}\n`
      : "";

  const textSection =
    input.text != null && input.text !== "" ? `\n### Document Text\n${input.text}\n` : "";

  const localeSection = `\n${buildAiOutputLocaleInstruction(aiLanguage)}\n`;
  const titlePolicySection = `\n${TITLE_POLICY_PROMPT}\n`;

  return `You are an expense evidence parser. Extract all expense line items from the provided document(s) and return structured JSON.
${categorySection}${currencySection}${customSection}${textSection}${localeSection}${titlePolicySection}
### Output Format

Return a single JSON object:

\`\`\`json
{
  "outcome": "success | invalid | anomaly",
  "anomaly_reason": "string or null — only when outcome is anomaly",
  "title": "merchant, service, or document name",
  "receipt_count": 1,
  "receipt_totals": [
    { "receipt_index": 0, "amount": "45.00", "currency": "CNY" }
  ],
  "ledger_entries": [
    {
      "receipt_index": 0,
      "item_name": "Lunch set",
      "amount": "45.00",
      "currency": "CNY",
      "category_index": 1,
      "notes": null
    }
  ],
  "order_adjustments": [
    { "receipt_index": 0, "item_name": "Discount", "amount": "-5.00", "currency": "CNY" }
  ],
  "reasoning": "brief explanation"
}
\`\`\`

### Important: Amount Formatting
- All amount fields must be **quoted decimal strings** (e.g. "45.00", "-5.00", "0.10").
- Never output unquoted JSON numbers for amounts — the system will reject them.
- Use the currency's ISO minor-unit precision: 0 decimals for zero-decimal currencies such as JPY, 3 decimals for currencies such as KWD, and 2 decimals for most currencies.
- Use standard minus sign - for negative values.

### Rules
- Valid evidence is not limited to completed receipts or invoices. It also includes an application or service screen that clearly identifies one expense and its exact payable, fixed, or estimated price. Record that price when it is clearly associated with the user's selected or ongoing transaction.
- Do not infer an expense from a balance, available credit, coupon value, price range, comparison list, advertisement, or an unrelated number on a status screen. If the screen does not clearly connect one price to one transaction or service, set outcome to "invalid".
- A displayed minus sign can be a visual convention for a debit, payment, spending, or charge. When it means money leaving the user, record the expense amount and receipt total as positive values. Do not treat the visual sign alone as a refund.
- Set outcome to "invalid" if the document contains no usable expense evidence.
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
  - A service screen with a selected ride and an explicitly labelled estimated, fixed, or payable price: record one expense for that service, even if the service is still in progress.
  - A screen showing a debit of -10.00 for a completed payment: record a 10.00 expense, not a negative ledger entry.
- Return only the JSON block, no other text.`;
}

export async function executeParser(
  input: ParserInput,
  ai: AiContextContract,
  signal?: AbortSignal
): Promise<NormalizedParseOutput> {
  const aiLanguage = input.aiLanguage ?? "zh-CN";
  const images = input.evidence?.images;
  const hasImages = (images?.length ?? 0) > 0;
  const model = hasImages ? "vision" : "text";

  const prompt = buildPrompt(input, aiLanguage);

  logger.debug({ model, hasImages }, "parser: calling AI");

  let response: Awaited<ReturnType<AiContextContract["generate"]>>;
  try {
    response = await ai.generate({
      model,
      prompt,
      messages: [{ role: "user", content: buildMessageContent(images) }],
      requireJson: true,
      ...(signal == null ? {} : { signal }),
    });
  } catch (error) {
    if (signal?.aborted) throw new ProcessingCancelledError();
    if (error instanceof ProcessingFailure) throw error;
    throw new ProcessingFailure("ai_provider_unavailable", "Parser AI request failed", {
      cause: error,
    });
  }

  let raw: unknown;
  try {
    const content = response.content
      .replace(/^```json\s*/m, "")
      .replace(/```\s*$/m, "")
      .trim();
    raw = JSON.parse(content);
  } catch (e) {
    throw new ProcessingFailure("ai_schema_invalid", "Parser AI response was not valid JSON", {
      cause: e,
    });
  }

  const parsed = parserOutputSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ProcessingFailure(
      "ai_schema_invalid",
      "Parser AI response failed schema validation",
      { cause: parsed.error }
    );
  }

  const result = normalizeResult(parsed.data, aiLanguage);
  logger.debug(
    { outcome: result.outcome, entries: result.ledger_entries.length },
    "parser: complete"
  );
  return result;
}
