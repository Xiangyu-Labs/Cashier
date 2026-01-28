import { ChatCompletionContentPart, ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { getOpenAIClient } from "../ai/openai";
import { buildTransactionPrompt } from "../ai/prompts";
import { summarizeTransactions } from "./utils";
import {
  MessageInput,
  MessageProcessor,
  ParsedTransaction,
  ProcessorContext,
  ProcessResult,
} from "./types";


const transactionSchema = z.object({
  item_name: z.string(),
  amount: z.number().min(0),
  currency: z.string().nullable(),
  category: z.string().nullable(),
  transaction_date: z.string().nullable(),
  notes: z.string().nullable().optional(), // Consolidated notes
});

const aiResponseSchema = z.object({
  transactions: z.array(transactionSchema).optional().default([]),
  title: z.string().optional(),
  is_valid: z.boolean().optional().default(true),
});


export class OpenAIMessageProcessor implements MessageProcessor {
  async process(
    input: MessageInput,
    context: ProcessorContext
  ): Promise<ProcessResult> {
    const client = getOpenAIClient();
    const currentDate = new Date().toISOString().split("T")[0];
    const systemPrompt = buildTransactionPrompt(context.categories, currentDate);

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
    const { transactions: data, isValid, title } = this.parseResponse(rawResponse);

    let transactions = data;

    if (context.mergeSimilarItems && transactions.length > 0) {
      transactions = await summarizeTransactions(transactions, input.text || undefined);
    }

    return {
      transactions,
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




  private parseResponse(response: string): { transactions: ParsedTransaction[], isValid: boolean, title?: string } {
    try {
      const cleaned = response.replace(/^```(?:json)?|```$/g, "").trim();
      const parsed = JSON.parse(cleaned);
      const validated = aiResponseSchema.parse(parsed);

      if (validated.is_valid === false) {
        return { transactions: [], isValid: false };
      }

      const transactions = validated.transactions.map((t) => ({
        itemName: t.item_name,
        amount: t.amount,
        currency: t.currency,
        category: t.category,
        transactionDate: t.transaction_date,
        notes: t.notes || null,
      }));

      return { transactions, isValid: true, title: validated.title };
    } catch (error) {
      logger.error({ error, response }, "Failed to parse AI response");
      throw new Error(`Failed to parse AI response: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

}

// Singleton instance
let processor: OpenAIMessageProcessor | null = null;

export function getMessageProcessor(): MessageProcessor {
  if (!processor) {
    processor = new OpenAIMessageProcessor();
  }
  return processor;
}
