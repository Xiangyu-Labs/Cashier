import type {
  AIClientFactory,
  AIContext,
  AIGenerateOptions,
  AIModelConfig,
  AIResponse,
  AIModelTier,
  TokenUsage,
} from "./types";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { isValidJson, extractJson, buildRepairPrompt } from "./json-utils";
import { AppError, ValidationError } from "@/lib/errors";
import { logger } from "@/lib/logger";

interface CreateAIContextOptions {
  signal: AbortSignal;
  reportTokens: (usage: TokenUsage) => void;
  getClient: AIClientFactory;
  modelConfig: AIModelConfig;
}

/**
 * Create AI context for task execution
 *
 * Provides AI capabilities to tasks with automatic token reporting
 * and abort signal propagation.
 */
export function createAIContext({
  signal,
  reportTokens,
  getClient,
  modelConfig,
}: CreateAIContextOptions): AIContext {
  return {
    async generate(options: AIGenerateOptions): Promise<AIResponse> {
      const client = getClient();

      // Convert messages to OpenAI format
      // Type assertion needed because OpenAI's ChatCompletionMessageParam is more permissive
      // than our AIMessage type, but we guarantee compatibility through runtime structure
      const messages = options.messages.map((msg) => ({
        role: msg.role,
        content:
          typeof msg.content === "string"
            ? msg.content
            : msg.content.map((part) => {
                if (part.type === "text") {
                  return { type: "text" as const, text: part.text };
                }
                // Safely construct image_url part with proper type assertion
                return {
                  type: "image_url" as const,
                  image_url: { url: part.image_url.url },
                };
              }),
      })) as ChatCompletionMessageParam[];

      // Guard: text tier must not receive image content
      if (options.model === "text") {
        const hasImages = options.messages.some(
          (msg) =>
            Array.isArray(msg.content) && msg.content.some((part) => part.type === "image_url")
        );
        if (hasImages) {
          throw new ValidationError(
            "text model tier does not support image content — use vision tier for image inputs"
          );
        }
      }

      // Resolve model tier to concrete model name from startup configuration
      const modelMap: Record<AIModelTier, string | undefined> = {
        text: modelConfig.text,
        vision: modelConfig.vision,
      };
      const model = modelMap[options.model];
      if (model == null || model === "") {
        throw new AppError(
          `AI model configuration for tier "${options.model}" is required`,
          "AI_MODEL_CONFIG_REQUIRED"
        );
      }

      const maxTokens = options.maxTokens ?? 8192;
      const temperature = options.temperature ?? 1;

      // Do not send response_format to the API — not all models support it.
      // JSON validation and repair is handled post-response via extractJson/isValidJson.
      const responseFormat = undefined;

      // Call OpenAI (signal is passed internally for cancellation)
      const result = await client.generateContent(
        options.prompt,
        messages,
        model,
        maxTokens,
        temperature,
        responseFormat,
        signal
      );

      // === JSON validation and repair (internal to task center) ===
      if (options.requireJson) {
        logger.debug(
          { rawContent: result.content.substring(0, 1000) },
          "AI raw response (requireJson)"
        );
        const extracted = extractJson(result.content);
        logger.debug({ extracted: extracted.substring(0, 1000) }, "AI extracted JSON");

        if (isValidJson(extracted) === false) {
          logger.warn(
            { content: result.content.substring(0, 500) },
            "AI returned invalid JSON, attempting repair"
          );

          // Use text model for repair (via AIModelTier selection)
          const textModel = modelMap["text"];
          if (textModel == null || textModel === "") {
            throw new AppError(
              'AI model configuration for tier "text" is required for JSON repair',
              "AI_MODEL_CONFIG_REQUIRED"
            );
          }

          const repairPrompt = buildRepairPrompt(result.content);

          // Internal call to client.generateContent, not through generate()
          // to avoid recursion - this is an internal implementation detail
          const repairResult = await client.generateContent(
            repairPrompt,
            [{ role: "user", content: "Please fix the JSON." }],
            textModel,
            8192,
            1,
            undefined,
            signal
          );

          const repairedExtracted = extractJson(repairResult.content);

          if (isValidJson(repairedExtracted) === false) {
            logger.error(
              {
                original: result.content.substring(0, 500),
                repaired: repairResult.content.substring(0, 500),
              },
              "JSON repair failed"
            );
            throw new AppError(
              "AI returned invalid JSON and repair attempt also failed",
              "AI_JSON_REPAIR_FAILED"
            );
          }

          logger.info("JSON repair successful");
          result.content = repairedExtracted;

          // Merge token usage statistics
          if (result.usage && repairResult.usage) {
            result.usage.promptTokens += repairResult.usage.promptTokens;
            result.usage.completionTokens += repairResult.usage.completionTokens;
          }
        } else {
          // Use extracted content (stripped markdown etc.)
          result.content = extracted;
        }
      }

      // Auto-report tokens unless disabled
      if (options.autoReportTokens !== false && result.usage != null) {
        reportTokens({
          model,
          input: result.usage.promptTokens,
          output: result.usage.completionTokens,
        });
      }

      if (result.usage == null) {
        return {
          content: result.content,
        };
      }

      return {
        content: result.content,
        usage: result.usage,
      };
    },
  };
}
