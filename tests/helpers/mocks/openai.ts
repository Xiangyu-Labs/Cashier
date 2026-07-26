import { vi } from "vitest";
import Decimal from "decimal.js";

/**
 * Multi-stage Mock AI for Integration Tests
 *
 * Creates a mock that returns different responses based on the system prompt,
 * supporting the new multi-stage parsing architecture.
 */

export interface MockEntryData {
  item_name: string;
  amount: string; // canonical decimal string, e.g. "25.50"
  currency?: string;
  category_index?: number;
  entry_date?: string | null;
  notes?: string | null;
}

export interface MultiStageMockOptions {
  /** Should the document be valid? (Stage 1.1) */
  isValid?: boolean;
  /** Should the document be complete? (Stage 1.2) */
  isComplete?: boolean;
  /** Incomplete reason if not complete */
  incompleteReason?: string;
  /** Currencies to detect (Stage 1.3) */
  currencies?: string[];
  /** Categories to detect (Stage 1.4) */
  categories?: string[];
  /** Document title (Stage 1.5) */
  title?: string;
  /** User requirements rules (Stage 1.6) */
  rules?: string[];
  /** Ledger entries (Stage 2) */
  entries?: MockEntryData[];
}

const DEFAULT_OPTIONS: Required<Omit<MultiStageMockOptions, "incompleteReason" | "rules">> = {
  isValid: true,
  isComplete: true,
  currencies: ["CNY"],
  categories: ["餐饮"],
  title: "测试账单",
  entries: [
    {
      item_name: "午餐",
      amount: "25.50",
      currency: "CNY",
      category_index: 1,
      entry_date: getCurrentDateIso(),
      notes: null,
    },
  ],
};

function getCurrentDateIso(): string {
  const isoDate = new Date().toISOString().split("T")[0] ?? "";
  if (isoDate === "") {
    throw new Error("Failed to derive current ISO date");
  }
  return isoDate;
}

/**
 * Create a mock OpenAI client that handles multi-stage AI calls
 */
export function createMultiStageMock(options: MultiStageMockOptions = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  return {
    generateContent: vi
      .fn()
      .mockImplementation(
        (
          _prompt: string,
          _messages: unknown[],
          _model: string,
          _maxTokens: number,
          _temperature: number,
          _responseFormat: unknown,
          _signal: AbortSignal
        ) => {
          const prompt = _prompt.toLowerCase();

          // Single-pass parser: route by its stable output protocol, not prompt wording.
          const isSinglePassParser =
            !prompt.includes("arbitration") &&
            prompt.includes('"receipt_totals"') &&
            prompt.includes('"order_adjustments"');
          if (isSinglePassParser) {
            const entries = opts.entries.map((e, index) => ({
              receipt_index: 0,
              item_name: e.item_name,
              amount: e.amount,
              currency: e.currency ?? opts.currencies[0] ?? "CNY",
              category_index: e.category_index ?? index + 1,
              notes: e.notes ?? null,
            }));
            const totalAmount = entries.reduce(
              (s, e) => new Decimal(s).plus(e.amount).toFixed(),
              "0"
            );
            const currency = opts.currencies[0] ?? "CNY";
            return Promise.resolve({
              content: JSON.stringify({
                outcome: "success",
                title: opts.title,
                receipt_count: 1,
                receipt_totals: [{ receipt_index: 0, amount: totalAmount, currency }],
                ledger_entries: entries,
                order_adjustments: [],
                reasoning: "Parsed expense entries from document",
              }),
              usage: { promptTokens: 200, completionTokens: 100 },
            });
          }

          // Single-pass arbitration
          const isStage0Arbitration = prompt.includes("arbitration ai");
          if (isStage0Arbitration) {
            return Promise.resolve({
              content: JSON.stringify({ choice: 1, reason: "result 1 is more accurate" }),
              usage: { promptTokens: 100, completionTokens: 50 },
            });
          }

          // Stage 1.5: Validation (reviews Stage 1 results)
          // MUST check FIRST - prompt contains "validation ai that reviews"
          const isValidationReview = prompt.includes("validation") && prompt.includes("reviews");
          const isVetoPower = prompt.includes("veto power");
          if (isValidationReview || isVetoPower) {
            return Promise.resolve({
              content: JSON.stringify({
                is_reasonable: true,
                summary: {
                  title: opts.title,
                  currencies: opts.currencies.map((c) => ({
                    code: c,
                    hint: `Identified ${c} from input`,
                  })),
                  categories: opts.categories.map((c) => ({
                    name: c,
                    hint: `Category matches content`,
                  })),
                  rules: [],
                },
              }),
              usage: { promptTokens: 150, completionTokens: 80 },
            });
          }

          // Stage 2: Detailed Parse - detect BEFORE Stage 1.3/1.4 as it contains their keywords
          // Unique keywords: "detailed financial document parser" or "ledger entries" or "pre-analysis context"
          const isDetailedParser = prompt.includes("detailed financial document parser");
          const hasLedgerEntries = prompt.includes("ledger_entries");
          const hasPreAnalysisContext = prompt.includes("pre-analysis context");
          if (isDetailedParser || hasLedgerEntries || hasPreAnalysisContext) {
            const currentDate = getCurrentDateIso();
            return Promise.resolve({
              content: JSON.stringify({
                ledger_entries: opts.entries.map((e, index) => ({
                  item_name: e.item_name,
                  amount: e.amount,
                  currency: e.currency ?? opts.currencies[0] ?? "CNY",
                  category_index: e.category_index ?? index + 1,
                  entry_date: e.entry_date === undefined ? currentDate : e.entry_date,
                  notes: e.notes ?? null,
                })),
                reasoning: "Parsed expense entries from document",
              }),
              usage: { promptTokens: 200, completionTokens: 100 },
            });
          }

          // Stage 1.1: Validity Check
          const hasValidity = prompt.includes("validity");
          const hasValidFinancial = prompt.includes("valid financial");
          if (hasValidity || hasValidFinancial) {
            return Promise.resolve({
              content: JSON.stringify({
                is_valid: opts.isValid,
                reasoning: opts.isValid
                  ? "Document contains clear expense information"
                  : "No financial data found",
              }),
              usage: { promptTokens: 100, completionTokens: 50 },
            });
          }

          // Stage 1.2: Completeness Check
          const hasComplete = prompt.includes("complete");
          const hasMissingContent = prompt.includes("missing content");
          if (hasComplete || hasMissingContent) {
            return Promise.resolve({
              content: JSON.stringify({
                is_complete: opts.isComplete ?? true,
                ...(opts.incompleteReason != null && opts.isComplete === false
                  ? { issue: opts.incompleteReason }
                  : {}),
              }),
              usage: { promptTokens: 100, completionTokens: 50 },
            });
          }

          // Stage 1.3: Currency Recognition
          const hasCurrency = prompt.includes("currency");
          const hasCurrencies = prompt.includes("currencies");
          if (hasCurrency || hasCurrencies) {
            return Promise.resolve({
              content: JSON.stringify({
                currencies: opts.currencies,
                reasoning: `Detected currencies: ${opts.currencies.join(", ")}`,
              }),
              usage: { promptTokens: 100, completionTokens: 50 },
            });
          }

          // Stage 1.4: Category Recognition
          const hasCategory = prompt.includes("category");
          const hasCategories = prompt.includes("categories");
          if (hasCategory || hasCategories) {
            return Promise.resolve({
              content: JSON.stringify({
                categories: opts.categories,
                reasoning: `Matched categories: ${opts.categories.join(", ")}`,
              }),
              usage: { promptTokens: 100, completionTokens: 50 },
            });
          }

          // Stage 1.5: Title Extraction
          const hasTitle = prompt.includes("title");
          const hasConciseSummary = prompt.includes("concise summary");
          if (hasTitle || hasConciseSummary) {
            return Promise.resolve({
              content: JSON.stringify({
                title: opts.title,
              }),
              usage: { promptTokens: 100, completionTokens: 50 },
            });
          }

          // Stage 1.6: User Requirements
          const hasUserRequirement = prompt.includes("user requirement");
          const hasCustomPrompt = prompt.includes("custom prompt");
          if (hasUserRequirement || hasCustomPrompt) {
            return Promise.resolve({
              content: JSON.stringify({
                rules: opts.rules ?? [],
              }),
              usage: { promptTokens: 100, completionTokens: 50 },
            });
          }

          // Arbitration
          const hasArbitration = prompt.includes("arbitration");
          const hasGpt1Result = prompt.includes("gpt 1 result");
          if (hasArbitration || hasGpt1Result) {
            return Promise.resolve({
              content: JSON.stringify({
                choice: 1,
                reason: "GPT 1 result is more accurate",
              }),
              usage: { promptTokens: 100, completionTokens: 50 },
            });
          }

          // Stage 2: Detailed Parse (default response)
          const currentDate = getCurrentDateIso();
          return Promise.resolve({
            content: JSON.stringify({
              ledger_entries: opts.entries.map((e, index) => ({
                item_name: e.item_name,
                amount: e.amount,
                currency: e.currency ?? opts.currencies[0] ?? "CNY",
                category_index: e.category_index ?? index + 1,
                entry_date: e.entry_date === undefined ? currentDate : e.entry_date,
                notes: e.notes ?? null,
              })),
              reasoning: "Parsed expense entries from document",
            }),
            usage: { promptTokens: 200, completionTokens: 100 },
          });
        }
      ),
  };
}

/**
 * Default multi-stage mock for simple test cases
 */
export const defaultMultiStageMock = createMultiStageMock();
