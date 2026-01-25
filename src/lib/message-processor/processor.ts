import { Part } from "@google/generative-ai";
import { z } from "zod";
import { getGeminiClient } from "../ai/gemini";
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
});

const aiResponseSchema = z.object({
  transactions: z.array(transactionSchema),
});

export class GeminiMessageProcessor implements MessageProcessor {
  async process(
    input: MessageInput,
    context: ProcessorContext
  ): Promise<ProcessResult> {
    const client = getGeminiClient();
    const systemPrompt = buildTransactionPrompt(context.language, context.categories);

    // 构建多模态内容
    const parts: Part[] = [];

    // 添加文本
    if (input.text) {
      parts.push({ text: input.text });
    }

    // 添加图片
    if (input.images && input.images.length > 0) {
      for (const image of input.images) {
        if (image.data.startsWith("data:")) {
          // Base64 data URL
          const base64Data = image.data.split(",")[1];
          parts.push({
            inlineData: {
              mimeType: image.mimeType,
              data: base64Data,
            },
          });
        } else {
          // 假设是 base64 字符串
          parts.push({
            inlineData: {
              mimeType: image.mimeType,
              data: image.data,
            },
          });
        }
      }
    }

    // 添加音频
    if (input.audio) {
      if (input.audio.data.startsWith("data:")) {
        const base64Data = input.audio.data.split(",")[1];
        parts.push({
          inlineData: {
            mimeType: input.audio.mimeType,
            data: base64Data,
          },
        });
      } else {
        parts.push({
          inlineData: {
            mimeType: input.audio.mimeType,
            data: input.audio.data,
          },
        });
      }
    }

    // 如果没有任何内容，添加一个提示
    if (parts.length === 0) {
      parts.push({ text: "（无输入内容）" });
    }

    // 调用 Gemini API
    const rawResponse = await client.generateContent(systemPrompt, parts);

    // 解析响应
    const transactions = this.parseResponse(rawResponse);

    return {
      transactions,
      rawResponse,
    };
  }

  private parseResponse(response: string): ParsedTransaction[] {
    try {
      // 清理可能的 markdown 代码块
      let cleaned = response.trim();
      if (cleaned.startsWith("```json")) {
        cleaned = cleaned.slice(7);
      } else if (cleaned.startsWith("```")) {
        cleaned = cleaned.slice(3);
      }
      if (cleaned.endsWith("```")) {
        cleaned = cleaned.slice(0, -3);
      }
      cleaned = cleaned.trim();

      const parsed = JSON.parse(cleaned);
      const validated = aiResponseSchema.parse(parsed);

      return validated.transactions.map((t) => ({
        itemName: t.item_name,
        amount: t.amount,
        currency: t.currency,
        category: t.category,
        transactionDate: t.transaction_date,
      }));
    } catch (error) {
      console.error("Failed to parse AI response:", error);
      console.error("Raw response:", response);
      return [];
    }
  }
}

// 单例实例
let processor: GeminiMessageProcessor | null = null;

export function getMessageProcessor(): MessageProcessor {
  if (!processor) {
    processor = new GeminiMessageProcessor();
  }
  return processor;
}
