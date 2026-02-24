import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Store original env values
const originalEnv = { ...process.env }

// Mock the OpenAI client
vi.mock('@/features/ai/server/services/openai', () => ({
    getOpenAIClient: () => ({
        generateContent: vi.fn().mockResolvedValue({
            content: '{"result": "success"}',
            usage: { promptTokens: 100, completionTokens: 50 },
        }),
    }),
}))

import { createAIContext } from '@/lib/flow/ai-context'
import type { TokenUsage } from '@/lib/flow/types'

describe('AI Context', () => {
    let reportTokensSpy: ReturnType<typeof vi.fn<(usage: TokenUsage) => void>>
    let abortController: AbortController

    beforeEach(() => {
        reportTokensSpy = vi.fn<(usage: TokenUsage) => void>()
        abortController = new AbortController()
        vi.clearAllMocks()
        // Set required env vars for tests
        process.env.AI_MODEL_TEXT = 'test-text-model'
        process.env.AI_MODEL_VISION = 'test-vision-model'
    })

    afterEach(() => {
        // Restore env
        process.env = { ...originalEnv }
    })

    describe('generate', () => {
        it('generates content with text tier', async () => {
            const aiContext = createAIContext(abortController.signal, reportTokensSpy)

            const result = await aiContext.generate({
                prompt: 'Test prompt',
                messages: [{ role: 'user', content: 'Hello' }],
                model: 'text',
            })

            expect(result.content).toBe('{"result": "success"}')
            expect(result.usage).toEqual({ promptTokens: 100, completionTokens: 50 })
        })

        it('generates content with vision tier', async () => {
            const aiContext = createAIContext(abortController.signal, reportTokensSpy)

            const result = await aiContext.generate({
                prompt: 'Describe this image',
                messages: [{ role: 'user', content: 'Hello' }],
                model: 'vision',
            })

            expect(result.content).toBe('{"result": "success"}')
        })

        it('auto-reports tokens by default', async () => {
            const aiContext = createAIContext(abortController.signal, reportTokensSpy)

            await aiContext.generate({
                prompt: 'Test prompt',
                messages: [{ role: 'user', content: 'Hello' }],
                model: 'text',
            })

            expect(reportTokensSpy).toHaveBeenCalledWith({
                model: 'test-text-model',
                input: 100,
                output: 50,
            })
        })

        it('does not report tokens when autoReportTokens is false', async () => {
            const aiContext = createAIContext(abortController.signal, reportTokensSpy)

            await aiContext.generate({
                prompt: 'Test prompt',
                messages: [{ role: 'user', content: 'Hello' }],
                model: 'text',
                autoReportTokens: false,
            })

            expect(reportTokensSpy).not.toHaveBeenCalled()
        })

        it('uses text model from environment', async () => {
            const aiContext = createAIContext(abortController.signal, reportTokensSpy)

            await aiContext.generate({
                prompt: 'Test prompt',
                messages: [{ role: 'user', content: 'Hello' }],
                model: 'text',
            })

            expect(reportTokensSpy).toHaveBeenCalledWith({
                model: 'test-text-model',
                input: 100,
                output: 50,
            })
        })

        it('uses vision model from environment', async () => {
            const aiContext = createAIContext(abortController.signal, reportTokensSpy)

            await aiContext.generate({
                prompt: 'Describe this image',
                messages: [{ role: 'user', content: 'Hello' }],
                model: 'vision',
            })

            expect(reportTokensSpy).toHaveBeenCalledWith({
                model: 'test-vision-model',
                input: 100,
                output: 50,
            })
        })

        it('throws error when AI_MODEL_TEXT is not set', async () => {
            delete process.env.AI_MODEL_TEXT
            const aiContext = createAIContext(abortController.signal, reportTokensSpy)

            await expect(aiContext.generate({
                prompt: 'Test prompt',
                messages: [{ role: 'user', content: 'Hello' }],
                model: 'text',
            })).rejects.toThrow('AI_MODEL_TEXT environment variable is required')
        })

        it('throws error when AI_MODEL_VISION is not set', async () => {
            delete process.env.AI_MODEL_VISION
            const aiContext = createAIContext(abortController.signal, reportTokensSpy)

            await expect(aiContext.generate({
                prompt: 'Describe this image',
                messages: [{ role: 'user', content: 'Hello' }],
                model: 'vision',
            })).rejects.toThrow('AI_MODEL_VISION environment variable is required')
        })

        it('supports image messages with vision tier', async () => {
            const aiContext = createAIContext(abortController.signal, reportTokensSpy)

            const result = await aiContext.generate({
                prompt: 'Describe this image',
                messages: [{
                    role: 'user',
                    content: [
                        { type: 'text', text: 'What is in this image?' },
                        { type: 'image_url', image_url: { url: 'data:image/png;base64,abc123' } },
                    ],
                }],
                model: 'vision',
            })

            expect(result.content).toBeDefined()
        })

        it('returns cleaned JSON content when requireJson is true', async () => {
            const aiContext = createAIContext(abortController.signal, reportTokensSpy)

            const result = await aiContext.generate({
                prompt: 'Test prompt',
                messages: [{ role: 'user', content: 'Hello' }],
                model: 'text',
                requireJson: true,
            })

            expect(result.content).toBe('{"result": "success"}')
        })
    })
})
