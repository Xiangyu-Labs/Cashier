import { describe, it, expect, vi, beforeEach } from "vitest";
import { createAIContext } from "@/lib/flow/ai-context";

// Mock the openai service
vi.mock("@/lib/ai/openai-client", () => ({
    getOpenAIClient: vi.fn().mockReturnValue({
        generateContent: vi.fn(),
    }),
}));

import { getOpenAIClient } from "@/lib/ai/openai-client";

describe("createAIContext", () => {
    let mockSignal: AbortSignal;
    let mockReportTokens: ReturnType<typeof vi.fn>;
    let mockGenerateContent: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        mockSignal = new AbortController().signal;
        mockReportTokens = vi.fn();
        mockGenerateContent = vi.fn().mockResolvedValue({
            content: '{"result": "test"}',
            usage: {
                promptTokens: 100,
                completionTokens: 50,
            },
        });

        // Setup mock return value
        vi.mocked(getOpenAIClient).mockReturnValue({
            generateContent: mockGenerateContent,
        });
    });

    it("should return an object with generate method", () => {
        const context = createAIContext(mockSignal, mockReportTokens);

        expect(context).toHaveProperty("generate");
        expect(typeof context.generate).toBe("function");
    });

    it("should generate content with basic options", async () => {
        const context = createAIContext(mockSignal, mockReportTokens);

        const result = await context.generate({
            prompt: "Test prompt",
            messages: [{ role: "user", content: "Hello" }],
            model: "text" as const,
        });

        expect(mockGenerateContent).toHaveBeenCalled();
        expect(result).toHaveProperty("content");
        expect(result).toHaveProperty("usage");
    });

    it("should throw error when text model receives image content", async () => {
        const context = createAIContext(mockSignal, mockReportTokens);

        await expect(
            context.generate({
                prompt: "Test prompt",
                messages: [
                    {
                        role: "user",
                        content: [
                            { type: "image_url" as const, image_url: { url: "http://example.com/image.jpg" } },
                        ],
                    },
                ],
                model: "text" as const,
            })
        ).rejects.toThrow("text model tier does not support image content");
    });

    it("should throw error when AI_MODEL_TEXT is not set", async () => {
        // Store original value
        const originalTextModel = process.env.AI_MODEL_TEXT;
        delete process.env.AI_MODEL_TEXT;

        const context = createAIContext(mockSignal, mockReportTokens);

        await expect(
            context.generate({
                prompt: "Test prompt",
                messages: [{ role: "user", content: "Hello" }],
                model: "text" as const,
            })
        ).rejects.toThrow("AI_MODEL_TEXT environment variable is required");

        // Restore original value
        if (originalTextModel) {
            process.env.AI_MODEL_TEXT = originalTextModel;
        }
    });

    it("should throw error when AI_MODEL_VISION is not set", async () => {
        // Store original value
        const originalVisionModel = process.env.AI_MODEL_VISION;
        delete process.env.AI_MODEL_VISION;

        const context = createAIContext(mockSignal, mockReportTokens);

        await expect(
            context.generate({
                prompt: "Test prompt",
                messages: [{ role: "user", content: "Hello" }],
                model: "vision" as const,
            })
        ).rejects.toThrow("AI_MODEL_VISION environment variable is required");

        // Restore original value
        if (originalVisionModel) {
            process.env.AI_MODEL_VISION = originalVisionModel;
        }
    });

    it("should use default maxTokens and temperature", async () => {
        const context = createAIContext(mockSignal, mockReportTokens);

        await context.generate({
            prompt: "Test prompt",
            messages: [{ role: "user", content: "Hello" }],
            model: "text" as const,
        });

        const callArgs = mockGenerateContent.mock.calls[0];
        expect(callArgs[3]).toBe(8192); // maxTokens default
        expect(callArgs[4]).toBe(1); // temperature default
    });

    it("should accept custom maxTokens and temperature", async () => {
        const context = createAIContext(mockSignal, mockReportTokens);

        await context.generate({
            prompt: "Test prompt",
            messages: [{ role: "user", content: "Hello" }],
            model: "text" as const,
            maxTokens: 2048,
            temperature: 0.5,
        });

        const callArgs = mockGenerateContent.mock.calls[0];
        expect(callArgs[3]).toBe(2048);
        expect(callArgs[4]).toBe(0.5);
    });

    it("should auto-report tokens by default", async () => {
        const context = createAIContext(mockSignal, mockReportTokens);

        await context.generate({
            prompt: "Test prompt",
            messages: [{ role: "user", content: "Hello" }],
            model: "text" as const,
        });

        expect(mockReportTokens).toHaveBeenCalledWith({
            model: expect.any(String),
            input: 100,
            output: 50,
        });
    });

    it("should not report tokens when autoReportTokens is false", async () => {
        const context = createAIContext(mockSignal, mockReportTokens);

        await context.generate({
            prompt: "Test prompt",
            messages: [{ role: "user", content: "Hello" }],
            model: "text" as const,
            autoReportTokens: false,
        });

        expect(mockReportTokens).not.toHaveBeenCalled();
    });

    it("should convert string messages to OpenAI format", async () => {
        const context = createAIContext(mockSignal, mockReportTokens);

        await context.generate({
            prompt: "Test prompt",
            messages: [
                { role: "user", content: "Hello" },
                { role: "assistant", content: "Hi there" },
            ],
            model: "text" as const,
        });

        const callArgs = mockGenerateContent.mock.calls[0];
        const messages = callArgs[1];

        expect(messages).toHaveLength(2);
        expect(messages[0]).toMatchObject({ role: "user", content: "Hello" });
        expect(messages[1]).toMatchObject({ role: "assistant", content: "Hi there" });
    });

    it("should handle requireJson option", async () => {
        // Mock for successful JSON extraction
        mockGenerateContent.mockResolvedValue({
            content: '{"result": "test"}',
            usage: { promptTokens: 100, completionTokens: 50 },
        });

        const context = createAIContext(mockSignal, mockReportTokens);

        const result = await context.generate({
            prompt: "Test prompt",
            messages: [{ role: "user", content: "Hello" }],
            model: "text" as const,
            requireJson: true,
        });

        expect(result.content).toBe('{"result": "test"}');
    });
});
