import OpenAI from "openai";
import { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { logger } from "@/lib/logger";

import { getCurrentTaskRunId } from "./ai-context";
import { recordTaskRunUsage } from "@/lib/flow/task-run-service";

export class OpenAIClient {
    private client: OpenAI;

    constructor() {
        const apiKey = process.env.OPENAI_API_KEY;
        const baseURL = process.env.OPENAI_BASE_URL;

        if (!apiKey) {
            throw new Error("OPENAI_API_KEY is required");
        }

        this.client = new OpenAI({
            apiKey,
            baseURL,
        });
    }

    async generateContent(
        systemPrompt: string,
        messages: ChatCompletionMessageParam[]
    ): Promise<{ content: string }> {
        const model = process.env.OPENAI_MODEL;
        const maxRetries = parseInt(process.env.AI_MAX_RETRIES || "3", 10);
        const baseDelay = parseInt(process.env.AI_RETRY_DELAY_MS || "1000", 10);

        if (!model) {
            throw new Error("OPENAI_MODEL is required");
        }

        let lastError: unknown;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                const response = await this.client.chat.completions.create({
                    model,
                    messages: [
                        { role: "system", content: systemPrompt },
                        ...messages,
                    ],
                    max_tokens: 4096,
                });

                const content = response.choices[0]?.message?.content || "";

                // Automatic usage recording via AsyncLocalStorage context
                if (response.usage) {
                    const taskRunId = getCurrentTaskRunId();
                    if (taskRunId) {
                        // Fire and forget - don't block the response
                        recordTaskRunUsage(taskRunId, {
                            inputTokens: response.usage.prompt_tokens,
                            outputTokens: response.usage.completion_tokens,
                            totalTokens: response.usage.total_tokens
                        }).catch(err => {
                            logger.error({ err, taskRunId }, "Failed to record token usage");
                        });
                    }
                }

                return { content };
            } catch (error) {
                lastError = error;
                const isRetryable =
                    error instanceof Error &&
                    (error.message.includes("429") || // Rate limit
                        error.message.includes("5") ||   // Server errors (5xx)
                        error.message.includes("timeout") ||
                        error.message.includes("ECONNRESET"));

                if (attempt < maxRetries) {
                    // Check if it is a 400 error (except 429) which is usually not retryable
                    if (error instanceof OpenAI.APIError && error.status && error.status >= 400 && error.status < 500 && error.status !== 429) {
                        throw error;
                    }

                    // Otherwise, retry if it is explicitly retryable or if we want to be robust
                    if (isRetryable || true) {
                        const delay = baseDelay * Math.pow(2, attempt);
                        logger.warn({ err: error, attempt: attempt + 1, maxRetries: maxRetries + 1, delay }, "OpenAI request failed, retrying");
                        await new Promise((resolve) => setTimeout(resolve, delay));
                        continue;
                    }
                }

                // If we're out of retries or it's not retryable, break loop
                break;
            }
        }

        throw lastError;
    }
}

// Singleton instance
let openAIClient: OpenAIClient | null = null;

export function getOpenAIClient(): OpenAIClient {
    if (!openAIClient) {
        openAIClient = new OpenAIClient();
    }
    return openAIClient;
}
