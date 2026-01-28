import { ChatCompletionContentPart, ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { getOpenAIClient } from "../ai/openai";
import { buildTransactionPrompt, buildSummarizationPrompt } from "../ai/prompts";
import {
  MessageInput,
  MessageProcessor,
  ParsedTransaction,
  ProcessorContext,
  ProcessResult,
} from "./types";

// Zod schema for validating AI response
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

const summarizationSchema = z.object({
  item_name: z.string(),
  notes: z.string().nullable().optional(),
});

export class OpenAIMessageProcessor implements MessageProcessor {
  async process(
    input: MessageInput,
    context: ProcessorContext
  ): Promise<ProcessResult> {
    const client = getOpenAIClient();
    const currentDate = new Date().toISOString().split("T")[0];
    const systemPrompt = buildTransactionPrompt(context.categories, currentDate);

    // Construct user message content parts
    const contentParts: ChatCompletionContentPart[] = [];

    // Add text
    if (input.text) {
      contentParts.push({ type: "text", text: input.text });
    }

    // Add images
    if (input.images && input.images.length > 0) {
      for (const image of input.images) {
        if (image.data.startsWith("data:")) {
          contentParts.push({
            type: "image_url",
            image_url: {
              url: image.data,
            },
          });
        } else {
          // Assume valid base64, construct data URL
          contentParts.push({
            type: "image_url",
            image_url: {
              url: `data:${image.mimeType};base64,${image.data}`,
            },
          });
        }
      }
    }

    // If no content, add a placeholder hint (though validation should prevent this)
    if (contentParts.length === 0) {
      contentParts.push({ type: "text", text: "（无输入内容）" });
    }

    const messages: ChatCompletionMessageParam[] = [
      { role: "user", content: contentParts },
    ];

    // Call OpenAI API
    const rawResponse = await client.generateContent(systemPrompt, messages);

    // Parse response
    const { transactions: data, isValid, title } = this.parseResponse(rawResponse);

    let transactions = data;

    // Apply merge similar items if enabled
    if (context.mergeSimilarItems && transactions.length > 0) {
      // Pass original text if available
      const originalText = input.text || undefined;
      transactions = await this.summarizeTransactions(transactions, originalText);
    }

    return {
      transactions,
      isValid,
      title,
      rawResponse,
    };
  }

  private async summarizeTransactions(
    transactions: ParsedTransaction[],
    originalText?: string
  ): Promise<ParsedTransaction[]> {
    const finalTransactions: ParsedTransaction[] = [];
    const groups: { [key: string]: ParsedTransaction[] } = {};

    // 1. Group by category and date
    // Key format: "date|category" or just maintain a map
    for (const t of transactions) {
      if (!t.transactionDate || !t.category) {
        finalTransactions.push(t); // Cannot merge if missing date or category
        continue;
      }
      const key = `${t.transactionDate}|${t.category}`;
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(t);
    }

    const client = getOpenAIClient();

    // 2. Process groups
    for (const key in groups) {
      const group = groups[key];
      if (group.length <= 1) {
        finalTransactions.push(...group);
        continue;
      }

      // Prepare items for GPT-2
      const itemsToSummarize = group.map(t => ({
        itemName: t.itemName,
        amount: t.amount,
        notes: t.notes
      }));

      const prompt = buildSummarizationPrompt(itemsToSummarize, originalText);

      try {
        const response = await client.generateContent(prompt, []); // Empty messages array as prompt is system prompt equivalent

        // Parse GPT-2 response
        const cleaned = response.replace(/^```(?:json)?|```$/g, "").trim();
        const parsed = JSON.parse(cleaned);
        const { item_name, notes } = summarizationSchema.parse(parsed);

        // Create merged transaction
        const totalAmount = group.reduce((sum, t) => sum + t.amount, 0);

        // Use the first item's metadata for shared fields
        const representative = group[0];

        finalTransactions.push({
          itemName: item_name,
          amount: totalAmount,
          currency: representative.currency,
          category: representative.category,
          transactionDate: representative.transactionDate,
          notes: notes || null
        });

      } catch (error) {
        logger.error({ error, key }, "Failed to summarize group");
        // Fallback: keep original items
        finalTransactions.push(...group);
      }
    }

    return finalTransactions;
  }

  private parseResponse(response: string): { transactions: ParsedTransaction[], isValid: boolean, title?: string } {
    try {
      // Remove markdown code blocks if present
      const cleaned = response.replace(/^```(?:json)?|```$/g, "").trim();

      const parsed = JSON.parse(cleaned);
      const validated = aiResponseSchema.parse(parsed);

      if (validated.is_valid === false) {
        return { transactions: [], isValid: false };
      }

      const transactions = validated.transactions.map((t) => {
        const {
          notes,
          item_name,
          amount,
          currency,
          category,
          transaction_date,
        } = t;

        return {
          itemName: item_name,
          amount,
          currency,
          category,
          transactionDate: transaction_date,
          notes: notes || null,
        };
      });

      return { transactions, isValid: true, title: validated.title };
    } catch (error) {
      logger.error({ error, response }, "Failed to parse AI response");
      // Throw error to let the queue processor handle it and mark message as failed
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
