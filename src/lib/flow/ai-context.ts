import { getOpenAIClient } from '@/features/ai/server/services/openai'
import type { AIContext, AIGenerateOptions, AIResponse, AIModelTier, TokenUsage } from './types'
import type { ChatCompletionMessageParam, ChatCompletionContentPart } from 'openai/resources/chat/completions'

/**
 * Create AI context for task execution
 *
 * Provides AI capabilities to tasks with automatic token reporting
 * and abort signal propagation.
 */
export function createAIContext(
    signal: AbortSignal,
    reportTokens: (usage: TokenUsage) => void
): AIContext {
    return {
        async generate(options: AIGenerateOptions): Promise<AIResponse> {
            const client = getOpenAIClient()

            // Convert messages to OpenAI format
            const messages = options.messages.map(msg => ({
                role: msg.role,
                content: typeof msg.content === 'string'
                    ? msg.content
                    : msg.content.map(part => {
                        if (part.type === 'text') {
                            return { type: 'text' as const, text: part.text }
                        }
                        return { type: 'image_url' as const, image_url: part.image_url }
                    }) as ChatCompletionContentPart[],
            })) as ChatCompletionMessageParam[]

            // Resolve model tier to concrete model name from environment
            const modelMap: Record<AIModelTier, string | undefined> = {
                fast: process.env.AI_MODEL_FAST,
                smart: process.env.AI_MODEL_SMART,
            }
            const model = modelMap[options.model]
            if (!model) {
                throw new Error(`AI_MODEL_${options.model.toUpperCase()} environment variable is required`)
            }

            const maxTokens = options.maxTokens ?? 16384
            const temperature = options.temperature ?? 1

            // Build response format for OpenAI
            let responseFormat: { type: 'text' } | { type: 'json_object' } | { type: 'json_schema'; json_schema: { name: string; schema: Record<string, unknown>; strict?: boolean } } | undefined
            if (options.responseFormat) {
                if (options.responseFormat === 'text') {
                    responseFormat = { type: 'text' }
                } else if (options.responseFormat === 'json_object') {
                    responseFormat = { type: 'json_object' }
                } else {
                    responseFormat = options.responseFormat
                }
            }

            // Call OpenAI (signal is passed internally for cancellation)
            const result = await client.generateContent(
                options.prompt,
                messages,
                model,
                maxTokens,
                temperature,
                responseFormat,
                signal
            )

            // Auto-report tokens unless disabled
            if (options.autoReportTokens !== false && result.usage) {
                reportTokens({
                    model,
                    input: result.usage.promptTokens,
                    output: result.usage.completionTokens,
                })
            }

            return {
                content: result.content,
                usage: result.usage,
            }
        },
    }
}
