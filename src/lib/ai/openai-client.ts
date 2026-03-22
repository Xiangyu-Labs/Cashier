import OpenAI from "openai";
import { type ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";

export class OpenAIClient {
  private client: OpenAI;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    const baseURL = process.env.OPENAI_BASE_URL;

    if (apiKey == null || apiKey === "") {
      throw new AppError("OPENAI_API_KEY is not set", "OPENAI_API_KEY_MISSING");
    }

    this.client = new OpenAI({
      apiKey,
      dangerouslyAllowBrowser: process.env.NODE_ENV === "test", // Only enable in test environment
      ...(baseURL != null && baseURL !== "" ? { baseURL } : {}),
    });
  }

  async generateContent(
    systemPrompt: string,
    messages: ChatCompletionMessageParam[],
    model: string,
    maxTokens?: number,
    temperature?: number,
    responseFormat?:
      | { type: "text" }
      | { type: "json_object" }
      | {
          type: "json_schema";
          json_schema: { name: string; schema: Record<string, unknown>; strict?: boolean };
        },
    signal?: AbortSignal
  ): Promise<{ content: string; usage?: { promptTokens: number; completionTokens: number } }> {
    const effectiveMaxTokens = maxTokens ?? 8192;
    const effectiveTemperature = temperature ?? 1;
    const maxRetries = parseInt(process.env.AI_MAX_RETRIES ?? "3", 10);
    const baseDelay = parseInt(process.env.AI_RETRY_DELAY_MS ?? "1000", 10);

    let lastError: unknown;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      // Check if aborted before each attempt
      if (signal?.aborted) {
        throw new AppError("Request was aborted", "REQUEST_ABORTED");
      }

      try {
        const requestMessages: ChatCompletionMessageParam[] = [
          { role: "system", content: systemPrompt },
          ...messages,
        ];
        const requestBase = {
          model,
          messages: requestMessages,
          max_tokens: effectiveMaxTokens,
          temperature: effectiveTemperature,
        };
        let request: OpenAI.ChatCompletionCreateParamsNonStreaming = requestBase;
        if (responseFormat != null) {
          request = {
            ...requestBase,
            response_format:
              responseFormat as Exclude<
                OpenAI.ChatCompletionCreateParams["response_format"],
                undefined
              >,
          };
        }
        const requestOptions = signal !== undefined ? { signal } : {};
        const response = await this.client.chat.completions.create(
          request,
          requestOptions
        );

        if (
          response.choices == null ||
          !Array.isArray(response.choices) ||
          response.choices.length === 0
        ) {
          logger.error({ response }, "OpenAI response missing choices");
          throw new AppError("Invalid OpenAI response: missing choices", "OPENAI_INVALID_RESPONSE");
        }

        const choice = response.choices[0];
        const content = choice?.message?.content ?? "";

        // Handle empty response with specific finish reasons
        if (content === "" && choice?.finish_reason != null) {
          if (choice.finish_reason === "content_filter") {
            throw new AppError(
              "Content was filtered by OpenAI safety systems. The image may contain content that cannot be processed."
              ,
              "OPENAI_CONTENT_FILTERED"
            );
          } else if (choice.finish_reason === "length") {
            throw new AppError(
              "Input too large: The images consume too many tokens, leaving no space for output. Try with fewer or smaller images."
              ,
              "OPENAI_INPUT_TOO_LARGE"
            );
          }
        }

        // Extract token usage from OpenAI response
        if (response.usage == null) {
          return { content };
        }

        return {
          content,
          usage: {
            promptTokens: response.usage.prompt_tokens,
            completionTokens: response.usage.completion_tokens,
          },
        };
      } catch (error) {
        lastError = error;

        // Don't retry if aborted
        if (signal?.aborted) {
          break;
        }

        // Determine if the error is retryable
        let isRetryable = true;

        // If it's an OpenAI APIError, check the status code
        if (error instanceof OpenAI.APIError && error.status != null) {
          // 4xx errors are generally NOT retryable, except for 429 (Rate Limit)
          if (error.status >= 400 && error.status < 500 && error.status !== 429) {
            isRetryable = false;
          }
        }

        if (attempt < maxRetries && isRetryable) {
          const delay = baseDelay * Math.pow(2, attempt);
          logger.warn(
            { err: error, attempt: attempt + 1, maxRetries: maxRetries + 1, delay },
            "OpenAI request failed, retrying"
          );
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

export function resetOpenAIClient(): void {
  openAIClient = null;
}
