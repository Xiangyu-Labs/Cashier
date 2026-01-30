import { ChatCompletionContentPart, ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { getOpenAIClient } from "../ai/openai";
import { buildLedgerEntryPrompt } from "../ai/prompts";
import {
  SourceDocumentInput,
  SourceDocumentProcessor,
  ParsedLedgerEntry,
  ProcessorContext,
  ProcessingResult,
} from "./types";


const ledgerEntrySchema = z.object({
  item_name: z.string().min(1, "Item name cannot be empty"),
  amount: z.number().min(0, "Amount must be non-negative"),
  currency: z.string().nullable().optional(),
  category: z.string().min(1, "Category cannot be empty"),
  entry_date: z.string().nullable(),
  notes: z.string().nullable().optional(),
});

const aiResponseSchema = z.object({
  ledger_entries: z.array(ledgerEntrySchema).describe("List of parsed ledger entries"),
  title: z.string().optional().describe("A brief title for the document"),
  is_valid: z.boolean().describe("Whether the content is a valid financial document (source document)"),
});


const VALID_CURRENCIES = new Set([
  "USD", "AUD", "BRL", "CAD", "CHF", "CNY", "CZK", "DKK", "EUR", "GBP",
  "HKD", "HUF", "IDR", "ILS", "INR", "ISK", "JPY", "KRW", "MXN", "MYR",
  "NOK", "NZD", "PHP", "PLN", "RON", "SEK", "SGD", "THB", "TRY", "ZAR"
]);

export class OpenAISourceDocumentProcessor implements SourceDocumentProcessor {
  async process(
    input: SourceDocumentInput,
    context: ProcessorContext
  ): Promise<ProcessingResult> {
    const client = getOpenAIClient();
    const currentDate = new Date().toISOString().split("T")[0];
    const systemPrompt = buildLedgerEntryPrompt(
      context.categories,
      context.aiLanguage,
      currentDate,
      context.preferredCurrencies,
      context.aiCustomPrompt,
      context.mergeSimilarItems
    );

    const contentParts: ChatCompletionContentPart[] = [];

    if (input.text) {
      contentParts.push({ type: "text", text: input.text });
    }

    if (input.images && input.images.length > 0) {
      contentParts.push(...this.processImages(input.images));
    }

    if (contentParts.length === 0) {
      contentParts.push({ type: "text", text: "（无输入内容）" });
    }

    const messages: ChatCompletionMessageParam[] = [
      { role: "user", content: contentParts },
    ];

    const { content: rawResponse } = await client.generateContent(systemPrompt, messages);
    const { ledgerEntries: data, isValid, title } = this.parseResponse(rawResponse, context.categories.map(c => c.name));

    const ledgerEntries = data;

    return {
      ledgerEntries,
      isValid,
      title,
      rawResponse,
    };
  }

  private processImages(images: Array<{ data: string; mimeType: string }>): ChatCompletionContentPart[] {
    return images.map(image => {
      const url = image.data.startsWith("data:")
        ? image.data
        : `data:${image.mimeType};base64,${image.data}`;

      return {
        type: "image_url",
        image_url: { url },
      };
    });
  }


  private parseResponse(response: string, allowedCategories: string[]): { ledgerEntries: ParsedLedgerEntry[], isValid: boolean, title?: string } {
    try {
      const cleaned = response.replace(/^```(?:json)?|```$/g, "").trim();
      let parsed;
      try {
        parsed = JSON.parse(cleaned);
      } catch (e) {
        throw new Error(`Invalid JSON format: ${e instanceof Error ? e.message : "Unknown error"}`);
      }

      const validated = aiResponseSchema.parse(parsed);

      if (validated.is_valid === false) {
        return { ledgerEntries: [], isValid: false };
      }

      const ledgerEntries = validated.ledger_entries.map((t, index) => {
        if (!t.category || !allowedCategories.includes(t.category)) {
          throw new Error(`Entry #${index + 1}: Invalid or missing category "${t.category}". Must be one of: ${allowedCategories.join(", ")}`);
        }

        const currency = t.currency || "unknown";
        if (currency !== "unknown" && !VALID_CURRENCIES.has(currency.toUpperCase())) {
          throw new Error(`Entry #${index + 1}: Invalid currency code "${currency}"`);
        }

        return {
          itemName: t.item_name,
          amount: t.amount,
          currency: currency,
          category: t.category,
          entryDate: t.entry_date,
          notes: t.notes || null,
        };
      });

      return { ledgerEntries, isValid: true, title: validated.title };
    } catch (error) {
      logger.error({ error, response }, "Failed to parse AI response");
      if (error instanceof z.ZodError) {
        const issues = error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ");
        throw new Error(`AI response schema validation failed: ${issues}`);
      }
      throw new Error(`Failed to parse AI response: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

}

// Singleton instance
let processor: OpenAISourceDocumentProcessor | null = null;

export function getSourceDocumentProcessor(): SourceDocumentProcessor {
  if (!processor) {
    processor = new OpenAISourceDocumentProcessor();
  }
  return processor;
}
