import { ChatCompletionContentPart, ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { getOpenAIClient } from "../ai/openai";
import { buildLedgerEntryPrompt } from "../ai/prompts";
import { summarizeLedgerEntries } from "./utils";
import {
  SourceDocumentInput,
  SourceDocumentProcessor,
  ParsedLedgerEntry,
  ProcessorContext,
  ProcessingResult,
} from "./types";


const ledgerEntrySchema = z.object({
  item_name: z.string(),
  amount: z.number().min(0),
  currency: z.string().nullable(),
  category: z.string(),
  entry_date: z.string().nullable(),
  notes: z.string().nullable().optional(),
});

const aiResponseSchema = z.object({
  ledger_entries: z.array(ledgerEntrySchema).optional().default([]),
  title: z.string().optional(),
  is_valid: z.boolean().optional().default(true),
});


export class OpenAISourceDocumentProcessor implements SourceDocumentProcessor {
  async process(
    input: SourceDocumentInput,
    context: ProcessorContext
  ): Promise<ProcessingResult> {
    const client = getOpenAIClient();
    const currentDate = new Date().toISOString().split("T")[0];
    const systemPrompt = buildLedgerEntryPrompt(context.categories, context.language, currentDate, context.preferredCurrencies);

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

    const rawResponse = await client.generateContent(systemPrompt, messages);
    const { ledgerEntries: data, isValid, title } = this.parseResponse(rawResponse, context.categories.map(c => c.name));

    let ledgerEntries = data;

    if (context.mergeSimilarItems && ledgerEntries.length > 0) {
      ledgerEntries = await summarizeLedgerEntries(ledgerEntries, context.language, input.text || undefined);
    }

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
      const parsed = JSON.parse(cleaned);
      const validated = aiResponseSchema.parse(parsed);

      if (validated.is_valid === false) {
        return { ledgerEntries: [], isValid: false };
      }

      const ledgerEntries = validated.ledger_entries.map((t) => {
        if (!t.category || !allowedCategories.includes(t.category)) {
          throw new Error(`Invalid or missing category: ${t.category}. Must be one of: ${allowedCategories.join(", ")}`);
        }
        return {
          itemName: t.item_name,
          amount: t.amount,
          currency: t.currency || "unknown",
          category: t.category,
          entryDate: t.entry_date,
          notes: t.notes || null,
        };
      });

      return { ledgerEntries, isValid: true, title: validated.title };
    } catch (error) {
      logger.error({ error, response }, "Failed to parse AI response");
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
