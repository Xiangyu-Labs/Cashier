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
        process.env.AI_MODEL_FAST = 'test-fast-model'
        process.env.AI_MODEL_SMART = 'test-smart-model'
    })

    afterEach(() => {
        // Restore env
        process.env = { ...originalEnv }
    })

    describe('generate', () => {
        it('generates content with fast tier', async () => {
            const aiContext = createAIContext(abortController.signal, reportTokensSpy)

            const result = await aiContext.generate({
                prompt: 'Test prompt',
                messages: [{ role: 'user', content: 'Hello' }],
                model: 'fast',
            })

            expect(result.content).toBe('{"result": "success"}')
            expect(result.usage).toEqual({ promptTokens: 100, completionTokens: 50 })
        })

        it('generates content with smart tier', async () => {
            const aiContext = createAIContext(abortController.signal, reportTokensSpy)

            const result = await aiContext.generate({
                prompt: 'Test prompt',
                messages: [{ role: 'user', content: 'Hello' }],
                model: 'smart',
            })

            expect(result.content).toBe('{"result": "success"}')
        })

        it('auto-reports tokens by default', async () => {
            const aiContext = createAIContext(abortController.signal, reportTokensSpy)

            await aiContext.generate({
                prompt: 'Test prompt',
                messages: [{ role: 'user', content: 'Hello' }],
                model: 'fast',
            })

            expect(reportTokensSpy).toHaveBeenCalledWith({
                model: 'test-fast-model',
                input: 100,
                output: 50,
            })
        })

        it('does not report tokens when autoReportTokens is false', async () => {
            const aiContext = createAIContext(abortController.signal, reportTokensSpy)

            await aiContext.generate({
                prompt: 'Test prompt',
                messages: [{ role: 'user', content: 'Hello' }],
                model: 'fast',
                autoReportTokens: false,
            })

            expect(reportTokensSpy).not.toHaveBeenCalled()
        })

        it('uses fast model from environment', async () => {
            const aiContext = createAIContext(abortController.signal, reportTokensSpy)

            await aiContext.generate({
                prompt: 'Test prompt',
                messages: [{ role: 'user', content: 'Hello' }],
                model: 'fast',
            })

            expect(reportTokensSpy).toHaveBeenCalledWith({
                model: 'test-fast-model',
                input: 100,
                output: 50,
            })
        })

        it('uses smart model from environment', async () => {
            const aiContext = createAIContext(abortController.signal, reportTokensSpy)

            await aiContext.generate({
                prompt: 'Test prompt',
                messages: [{ role: 'user', content: 'Hello' }],
                model: 'smart',
            })

            expect(reportTokensSpy).toHaveBeenCalledWith({
                model: 'test-smart-model',
                input: 100,
                output: 50,
            })
        })

        it('throws error when AI_MODEL_FAST is not set', async () => {
            delete process.env.AI_MODEL_FAST
            const aiContext = createAIContext(abortController.signal, reportTokensSpy)

            await expect(aiContext.generate({
                prompt: 'Test prompt',
                messages: [{ role: 'user', content: 'Hello' }],
                model: 'fast',
            })).rejects.toThrow('AI_MODEL_FAST environment variable is required')
        })

        it('throws error when AI_MODEL_SMART is not set', async () => {
            delete process.env.AI_MODEL_SMART
            const aiContext = createAIContext(abortController.signal, reportTokensSpy)

            await expect(aiContext.generate({
                prompt: 'Test prompt',
                messages: [{ role: 'user', content: 'Hello' }],
                model: 'smart',
            })).rejects.toThrow('AI_MODEL_SMART environment variable is required')
        })

        it('supports image messages', async () => {
            const aiContext = createAIContext(abortController.signal, reportTokensSpy)

            // This should not throw
            const result = await aiContext.generate({
                prompt: 'Describe this image',
                messages: [{
                    role: 'user',
                    content: [
                        { type: 'text', text: 'What is in this image?' },
                        { type: 'image_url', image_url: { url: 'data:image/png;base64,abc123' } },
                    ],
                }],
                model: 'fast',
            })

            expect(result.content).toBeDefined()
        })
    })
})
