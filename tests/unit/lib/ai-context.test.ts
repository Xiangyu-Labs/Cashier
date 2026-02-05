import { describe, it, expect, vi, beforeEach } from 'vitest'

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

describe('AI Context', () => {
    let reportTokensSpy: ReturnType<typeof vi.fn>
    let abortController: AbortController

    beforeEach(() => {
        reportTokensSpy = vi.fn()
        abortController = new AbortController()
        vi.clearAllMocks()
    })

    describe('generate', () => {
        it('generates content with default options', async () => {
            const aiContext = createAIContext(abortController.signal, reportTokensSpy)

            const result = await aiContext.generate({
                prompt: 'Test prompt',
                messages: [{ role: 'user', content: 'Hello' }],
            })

            expect(result.content).toBe('{"result": "success"}')
            expect(result.usage).toEqual({ promptTokens: 100, completionTokens: 50 })
        })

        it('auto-reports tokens by default', async () => {
            const aiContext = createAIContext(abortController.signal, reportTokensSpy)

            await aiContext.generate({
                prompt: 'Test prompt',
                messages: [{ role: 'user', content: 'Hello' }],
            })

            expect(reportTokensSpy).toHaveBeenCalledWith({
                model: expect.any(String),
                input: 100,
                output: 50,
            })
        })

        it('does not report tokens when autoReportTokens is false', async () => {
            const aiContext = createAIContext(abortController.signal, reportTokensSpy)

            await aiContext.generate({
                prompt: 'Test prompt',
                messages: [{ role: 'user', content: 'Hello' }],
                autoReportTokens: false,
            })

            expect(reportTokensSpy).not.toHaveBeenCalled()
        })

        it('uses provided model instead of default', async () => {
            const aiContext = createAIContext(abortController.signal, reportTokensSpy)

            await aiContext.generate({
                prompt: 'Test prompt',
                messages: [{ role: 'user', content: 'Hello' }],
                model: 'gpt-4o-mini',
            })

            expect(reportTokensSpy).toHaveBeenCalledWith({
                model: 'gpt-4o-mini',
                input: 100,
                output: 50,
            })
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
            })

            expect(result.content).toBeDefined()
        })
    })
})
