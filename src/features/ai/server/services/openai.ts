import OpenAI from "openai";
import { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { logger } from "@/lib/logger";

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
        messages: ChatCompletionMessageParam[],
        model: string,
        maxTokens?: number,
        temperature?: number,
        responseFormat?: { type: 'text' } | { type: 'json_object' } | { type: 'json_schema'; json_schema: { name: string; schema: Record<string, unknown>; strict?: boolean } },
        signal?: AbortSignal
    ): Promise<{ content: string; usage?: { promptTokens: number; completionTokens: number } }> {
        const effectiveMaxTokens = maxTokens ?? 16384;
        const effectiveTemperature = temperature ?? 1;
        const maxRetries = parseInt(process.env.AI_MAX_RETRIES || "3", 10);
        const baseDelay = parseInt(process.env.AI_RETRY_DELAY_MS || "1000", 10);

        let lastError: unknown;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            // Check if aborted before each attempt
            if (signal?.aborted) {
                throw new Error("Request was aborted");
            }

            try {
                const response = await this.client.chat.completions.create({
                    model: model,
                    messages: [
                        { role: "system", content: systemPrompt },
                        ...messages,
                    ],
                    max_tokens: effectiveMaxTokens,
                    temperature: effectiveTemperature,
                    ...(responseFormat && { response_format: responseFormat as OpenAI.ChatCompletionCreateParams['response_format'] }),
                }, {
                    signal, // Pass abort signal to OpenAI SDK
                });

                if (!response.choices || !Array.isArray(response.choices) || response.choices.length === 0) {
                    logger.error({ response }, "OpenAI response missing choices");
                    throw new Error("Invalid OpenAI response: missing choices");
                }

                const choice = response.choices[0];
                const content = choice?.message?.content || "";

                // Handle empty response with specific finish reasons
                if (!content && choice?.finish_reason) {
                    if (choice.finish_reason === 'content_filter') {
                        throw new Error('Content was filtered by OpenAI safety systems. The image may contain content that cannot be processed.');
                    } else if (choice.finish_reason === 'length') {
                        throw new Error('Input too large: The images consume too many tokens, leaving no space for output. Try with fewer or smaller images.');
                    }
                }

                // Extract token usage from OpenAI response
                const usage = response.usage ? {
                    promptTokens: response.usage.prompt_tokens,
                    completionTokens: response.usage.completion_tokens,
                } : undefined;

                return { content, usage };
            } catch (error) {
                lastError = error;

                // Don't retry if aborted
                if (signal?.aborted) {
                    break;
                }

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
