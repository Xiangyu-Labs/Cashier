/**
 * Receipt and invoice parser
 *
 * One AI call extracts validity, structured line items, receipt totals, and
 * order adjustments directly from images and/or text. No separate OCR stage.
 *
 * Uses a vision model when images are present, a text model for text-only input.
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
  "outcome": "success | invalid",
  "invalid_reason": "string or null — only when outcome is invalid",
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

### Amount Formatting
- All amounts are **quoted decimal strings** (e.g. "45.00", "-5.00", "0.10") — never unquoted JSON numbers, the system will reject them.
- Use the currency's ISO minor-unit precision: 0 decimals for zero-decimal currencies (e.g. JPY), 3 decimals for currencies like KWD, 2 decimals otherwise.
- Use a standard minus sign \`-\` for negative values.
- **\`currency\` is always the ISO 4217 three-letter code** (e.g. "MYR", "CNY", "USD") — never a local symbol, abbreviation, or prefix as shown on the document (e.g. "RM", "¥", "S$"). Convert the document's local currency marker to its ISO code even though the amount itself stays in that local currency.
- **Every ledger_entry.amount must be strictly greater than 0.** A line with no price of its own (see "Informational / no-price lines" below) must never appear as a ledger_entry, even at "0.00" — a zero-amount ledger_entry is always rejected by the system as invalid.
- **When an amount is shown twice — an original/local-currency figure plus a "≈" converted estimate in another currency — record the original local-currency figure and its own currency, never the "≈" estimate.** For example "RM 1,713.00 ≈ ¥2,847.90" or "RM ▾ 9.18 ≈ ¥15.23" means the real amount and currency is MYR 1,713.00 / MYR 9.18; the ¥ figure is only a reference conversion, not the recorded currency.

### Rules
- Valid evidence isn't limited to completed receipts/invoices — it also includes an app/service screen that clearly ties one expense to its exact payable, fixed, or estimated price. Do not infer an expense from a balance, available credit, coupon value, price range, comparison list, ad, or unrelated number — if no screen clearly connects one price to one transaction, set outcome "invalid".
  - Ride-hailing / delivery booking screens: a **confirmed, single selected ride/order** showing one estimated or fixed fare is valid evidence — record it even if the trip is still in progress. But a screen where the user is still **choosing among several vehicle types or waiting to be matched**, showing a price range across multiple options (e.g. "已选24种车型，预估11-12元" or "预估11.4-14元起"), is not yet a transaction — treat it like a price range/comparison list and set outcome "invalid".
  - **A bank/payment debit notification (SMS alert, push notification banner, "consumption reminder") is valid, completed evidence on its own — even when it's shown layered on top of, or alongside, a different app screen that is itself still mid-process** (e.g. a ride-hailing screen still "matching"/"confirming driver" behind the notification). The notification reports money that has already left the account; the state of whatever screen is behind it doesn't retroactively make that charge unconfirmed. Read the amount and currency from the notification banner and record it — don't reject the whole image just because the underlying app screen looks incomplete.
- A displayed minus sign on a debit/payment/charge is a visual convention, not a refund — when it means money leaving the user, record the amount (and receipt total) as positive.
- outcome "invalid": no usable expense evidence at all, OR it's a receipt but can't be reliably parsed (blurry, torn, missing totals), OR it's a refund/credit note (this system only handles expenses) — include invalid_reason.
- Prefer computing a receipt_total yourself (sum of visible item prices + visible fees) over rejecting the document — see "No final-total line" below. Only fall back to invalid when you genuinely cannot determine a usable amount.
- Core accounting rule: sum(ledger_entries.amount) + sum(order_adjustments.amount) = receipt total. Every monetary effect (discount, fee, tax, shipping, packaging, service charge, subsidy, rounding) appears exactly once — never in both arrays.
- **receipt_total must match the item list you actually parsed for that receipt_index** — it's the sum of the visible item prices and fees you extracted, not some other total-like figure that happens to appear elsewhere on the same screen (e.g. an account's cumulative/running balance, a different day's subtotal, an unrelated summary number). If a screen shows more than one total-like number, use the one arithmetically consistent with the line items you're recording; a total that doesn't match your own item list is a sign you picked the wrong number, not a sign the items are incomplete.
- ledger_entries are only the products/services actually purchased. Each amount is that item's own final net price (fold item-specific discounts/surcharges into it). Always strictly positive (> 0) — see the Amount Formatting note above.
- order_adjustments are bill-level effects that don't attach to one specific item: discounts, coupons, spend-threshold promos, shipping/packaging/service/delivery fees, taxes, tips, platform subsidies, rounding. If an adjustment can't be confidently attributed to exactly one item, put it here rather than guessing a distribution. Don't drop a real bill-level charge just because it isn't attached to an item. This still applies with only one item on the receipt — a bill-level fee/discount never gets folded into that single item's amount.
  - **Delivery, packaging, and platform/service fees on a food or goods order are order_adjustments, never their own ledger_entry or category, whenever there's at least one product/service item on the receipt to attach them to** — despite "delivery" sounding transport-related, don't give it a transportation category_index.
  - **Exception: if a delivery/errand/service fee is the *only* charge on the receipt — there is no separate product or service item at all, just the fee itself (e.g. a standalone Grab/跑腿 errand-running charge, a delivery-only order with no goods listed) — record it as a normal ledger_entry instead**, with whatever category best fits the service (e.g. errand/life category), not as an order_adjustment. An order_adjustment with nothing to attach to has no item to distribute onto and the amount is lost — never leave order_adjustments as the only place a receipt's money appears.
- Reconciliation: some receipts show a discount line that is only a recap/summary of item-level discounts already reflected in the item prices — don't re-add that as another order_adjustment. Use simple arithmetic against the receipt total to tell a true additional bill-level adjustment apart from a mere recap. Conversely, don't drop genuine bill-level fees/charges (shipping, packaging, etc.) that affect the total and aren't already inside an item amount.
  - **Multi-tier discount checkout summaries** (e.g. "商品总价 ¥79.7" → "店铺优惠 -¥14.6" → "平台优惠 -¥6.77" → "实付款 ¥58.33"), where each item row already shows its own final "实付价"/paid price: use those per-item paid prices and the final paid total directly as your ledger_entries and receipt_total. Do not also try to re-derive or sanity-check against the pre-discount "商品总价" — the per-tier discounts are usually not evenly splittable per item, and re-checking against the subtotal will produce a false amount_conflict.
- Each receipt in a multi-receipt image gets its own receipt_index starting at 0. A screenshot can contain several independent things stacked together — multiple bank SMS payment alerts, several app "payment successful" cards, or **several distinct e-commerce orders in an order-list screen (each with its own merchant, item, and a clearly visible paid price)** — treat each as its own receipt/receipt_index rather than rejecting the whole screenshot. If one of several items is truncated or unclear (e.g. the bottom order is cut off and its price isn't visible), just skip that one and still parse the other, complete ones normally — one incomplete entry among several does not invalidate the rest.
- No separate final-total line is normal, not a reason for invalid: many documents show only item price(s) and visible fees with no distinct "final total" line — compute receipt_total yourself as their sum. Only treat it as unparseable when the item price(s) themselves are also illegible or absent.
- Undisclosed / not-fully-itemized purchases — **only when the document itself explicitly signals there's more you can't see** (e.g. "还有7种商品未展开", "共10件商品" with a collapsed list, an order summary showing only a subtotal for extra items): don't set invalid just because the visible items don't sum to the total.
  - If some items are individually visible: list them as their own ledger_entries, then add exactly one rollup ledger_entry for the remainder (item_name like "其他N种商品（未显示明细）" / "Other N items (not itemized)"), amount = receipt total − sum of visible items, with notes explaining the derivation.
  - If nothing is itemized and only one merged total is shown for multiple products (e.g. "5件商品 合计¥46.40"): record one ledger_entry for that whole merged amount, named after the merchant/order.
  - Skip this backfill only when the remainder would be implausible (negative, or wildly disproportionate to the visible items) — treat that instead as a genuine reconciliation problem under the normal invalid rule.
  - **Never invent this rollup line just because your own sum doesn't match a total you picked** — if there's no explicit "more items exist" signal on the document, a mismatch means you likely misread the total (see the receipt_total rule above) or an item's price, not that hidden items exist. Fabricating a placeholder entry to force balance is worse than leaving a smaller, honest mismatch.
- Informational / no-price lines (allergen or ingredient notices, free/gift items with no charge, item options/customizations attached to another item, disclaimers): **never their own ledger_entry, not even at "0.00"**. If unsure whether a line is a priced item or descriptive text, fold it into the notes of the item it describes rather than emitting a zero-amount entry. Example: a menu shows "铂金精品美式 ¥0.00 (赠品)" — do not add a ledger_entry for it; mention it in the notes of a nearby paid item instead, or omit it if it has nothing to attach to.
- Personal share vs. full group/total: if a document shows a full payment total for a shared/group expense (deposit, group purchase, split bill) alongside text that explicitly states the amount owed by or attributable to the ledger's own user (a per-person split, "my share is X"), record that explicit personal share, not the full total. Use the full total only when no personal share is explicitly stated.
- Examples:
  - Item + shipping fee + order-level coupon: item's own final price in ledger_entries; shipping fee and coupon both in order_adjustments.
  - Two items with item-level discounts of -10 and -20, plus a displayed "Discount -30" summary line: -30 is just their recap — don't add it as a third order_adjustment.
  - Food delivery order: item prices + packaging fee + delivery fee, no separate final-total screen: receipt_total = sum of all three; packaging/delivery fee as order_adjustments, not a transportation entry.
  - A standalone Grab/跑腿 errand-running fee with no goods or product listed — just "配送费 RM 13.00": record it as one ledger_entry ("配送费"/"跑腿"), not an order_adjustment — there's nothing else on the receipt for the fee to attach to.
  - Receipt total ¥77.09 but only 3 of 7 items individually listed (summing ¥25.94), and the screen says "还有4种商品未展开": keep the 3 visible items, add one "其他4种商品（未显示明细）" entry for ¥51.15.
  - Group deposit receipt shows RM 500.00, chat text says "每人是166.66RM": record 166.66 MYR, not 500.00 MYR.
  - An app detail screen shows "合计金额: ¥2,847.90" at the top but the line item itself reads "RM ▾ 1,713.00 ≈ ¥2,847.90": record 1,713.00 MYR, not 2,847.90 CNY.
  - Three separate Taobao orders in an order list, each with its own visible "实付款" (¥21.42, ¥14.26, ¥22.65) and a combined "实付款 共减¥21.37 ¥58.33" summary: record the three items at their own paid prices (summing to 58.33); do not also subtract the ¥21.37 discount again or reconcile against the pre-discount ¥79.7 subtotal.
  - A bank SMS "消费提醒：您尾号1234的信用卡于XX日消费18.98元" banner sits on top of a ride-hailing "司机正在确认中" (driver confirming) screen: record 18.98 CNY from the notification — the ride app's in-progress state behind it doesn't invalidate the already-completed bank charge.
- Return only the JSON block, no other text.
`;
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
