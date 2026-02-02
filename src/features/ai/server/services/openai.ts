import OpenAI from "openai";
import { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { logger } from "@/lib/logger";

import { getCurrentTaskRunId, getCurrentLedgerId } from "../ai-context";
import { recordTaskRunUsage } from "@/features/tasks/server/services/task-run-service";

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
            dangerouslyAllowBrowser: true, // Needed for Vitest environment which might be detected as browser
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

                if (!response.choices || !Array.isArray(response.choices) || response.choices.length === 0) {
                    logger.error({ response }, "OpenAI response missing choices");
                    throw new Error("Invalid OpenAI response: missing choices");
                }

                const content = response.choices[0]?.message?.content || "";

                if (response.usage) {
                    const taskRunId = getCurrentTaskRunId();
                    const ledgerId = getCurrentLedgerId();
                    if (taskRunId) {
                        // Fire and forget - don't block the response
                        recordTaskRunUsage(taskRunId, {
                            inputTokens: response.usage.prompt_tokens,
                            outputTokens: response.usage.completion_tokens,
                            totalTokens: response.usage.total_tokens
                        }, ledgerId).catch(err => {
                            logger.error({ err, taskRunId }, "Failed to record token usage");
                        });
                    }
                }

                return { content };
            } catch (error) {
                lastError = error;

                // Determine if the error is retryable
                let isRetryable = true;

                // If it's an OpenAI APIError, check the status code
                if (error instanceof OpenAI.APIError && error.status) {
                    // 4xx errors are generally NOT retryable, except for 429 (Rate Limit)
                    if (error.status >= 400 && error.status < 500 && error.status !== 429) {
                        isRetryable = false;
                    }
                }

                if (attempt < maxRetries && isRetryable) {
                    const delay = baseDelay * Math.pow(2, attempt);
                    logger.warn({ err: error, attempt: attempt + 1, maxRetries: maxRetries + 1, delay }, "OpenAI request failed, retrying");
                    await new Promise((resolve) => setTimeout(resolve, delay));
                    continue;
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
