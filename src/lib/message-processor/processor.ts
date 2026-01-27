import { ChatCompletionContentPart, ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { z } from "zod";
import { getOpenAIClient } from "../ai/openai";
import { buildTransactionPrompt } from "../ai/prompts";
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
  amount: z.number().positive(),
  currency: z.string().nullable(),
  category: z.string().nullable(),
  transaction_date: z.string().nullable(),
  notes: z.string().nullable().optional(), // Consolidated notes
});

const aiResponseSchema = z.object({
  transactions: z.array(transactionSchema),
});

export class OpenAIMessageProcessor implements MessageProcessor {
  async process(
    input: MessageInput,
    context: ProcessorContext
  ): Promise<ProcessResult> {
    const client = getOpenAIClient();
    const systemPrompt = buildTransactionPrompt(context.categories);

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
    const data = this.parseResponse(rawResponse);

    // Apply auto-confirm if enabled
    const transactions = data;

    return {
      transactions,
      rawResponse,
    };
  }

  private parseResponse(response: string): ParsedTransaction[] {
    try {
      // Remove markdown code blocks if present
      const cleaned = response.replace(/^```(?:json)?|```$/g, "").trim();

      const parsed = JSON.parse(cleaned);
      const validated = aiResponseSchema.parse(parsed);

      return validated.transactions.map((t) => {
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
    } catch (error) {
      console.error("Failed to parse AI response:", error);
      console.error("Raw response:", response);
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
