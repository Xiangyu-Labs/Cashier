import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TokenUsage, AIClient } from "@/lib/flow/types";
import { createAIContext } from "@/lib/flow/ai-context";

describe("createAIContext", () => {
  let mockSignal: AbortSignal;
  let mockReportTokens: ReturnType<typeof vi.fn>;
  let mockGenerateContent: ReturnType<typeof vi.fn>;
  let mockClient: AIClient;

  const getGenerateContentCall = (index = 0) => {
    const call = mockGenerateContent.mock.calls[index];
    expect(call).toBeDefined();
    if (call == null) {
      throw new Error("Expected generateContent to be called");
    }
    return call;
  };

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
    mockClient = {
      generateContent: mockGenerateContent as unknown as AIClient["generateContent"],
    };
  });

  it("should return an object with generate method", () => {
    const context = createAIContext({
      signal: mockSignal,
      reportTokens: mockReportTokens as (usage: TokenUsage) => void,
      getClient: () => mockClient,
      modelConfig: { text: "test-text-model", vision: "test-vision-model" },
    });

    expect(context).toHaveProperty("generate");
    expect(typeof context.generate).toBe("function");
  });

  it("should generate content with basic options", async () => {
    const context = createAIContext({
      signal: mockSignal,
      reportTokens: mockReportTokens as (usage: TokenUsage) => void,
      getClient: () => mockClient,
      modelConfig: { text: "test-text-model", vision: "test-vision-model" },
    });

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
    const context = createAIContext({
      signal: mockSignal,
      reportTokens: mockReportTokens as (usage: TokenUsage) => void,
      getClient: () => mockClient,
      modelConfig: { text: "test-text-model", vision: "test-vision-model" },
    });

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

  it("should throw error when text model config is missing", async () => {
    const context = createAIContext({
      signal: mockSignal,
      reportTokens: mockReportTokens as (usage: TokenUsage) => void,
      getClient: () => mockClient,
      modelConfig: { text: "", vision: "test-vision-model" },
    });

    await expect(
      context.generate({
        prompt: "Test prompt",
        messages: [{ role: "user", content: "Hello" }],
        model: "text" as const,
      })
    ).rejects.toThrow('AI model configuration for tier "text" is required');
  });

  it("should throw error when vision model config is missing", async () => {
    const context = createAIContext({
      signal: mockSignal,
      reportTokens: mockReportTokens as (usage: TokenUsage) => void,
      getClient: () => mockClient,
      modelConfig: { text: "test-text-model", vision: "" },
    });

    await expect(
      context.generate({
        prompt: "Test prompt",
        messages: [{ role: "user", content: "Hello" }],
        model: "vision" as const,
      })
    ).rejects.toThrow('AI model configuration for tier "vision" is required');
  });

  it("should use default maxTokens and temperature", async () => {
    const context = createAIContext({
      signal: mockSignal,
      reportTokens: mockReportTokens as (usage: TokenUsage) => void,
      getClient: () => mockClient,
      modelConfig: { text: "test-text-model", vision: "test-vision-model" },
    });

    await context.generate({
      prompt: "Test prompt",
      messages: [{ role: "user", content: "Hello" }],
      model: "text" as const,
    });

    const callArgs = getGenerateContentCall();
    expect(callArgs[3]).toBe(8192); // maxTokens default
    expect(callArgs[4]).toBe(1); // temperature default
  });

  it("should accept custom maxTokens and temperature", async () => {
    const context = createAIContext({
      signal: mockSignal,
      reportTokens: mockReportTokens as (usage: TokenUsage) => void,
      getClient: () => mockClient,
      modelConfig: { text: "test-text-model", vision: "test-vision-model" },
    });

    await context.generate({
      prompt: "Test prompt",
      messages: [{ role: "user", content: "Hello" }],
      model: "text" as const,
      maxTokens: 2048,
      temperature: 0.5,
    });

    const callArgs = getGenerateContentCall();
    expect(callArgs[3]).toBe(2048);
    expect(callArgs[4]).toBe(0.5);
  });

  it("should auto-report tokens by default", async () => {
    const context = createAIContext({
      signal: mockSignal,
      reportTokens: mockReportTokens as (usage: TokenUsage) => void,
      getClient: () => mockClient,
      modelConfig: { text: "test-text-model", vision: "test-vision-model" },
    });

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
    const context = createAIContext({
      signal: mockSignal,
      reportTokens: mockReportTokens as (usage: TokenUsage) => void,
      getClient: () => mockClient,
      modelConfig: { text: "test-text-model", vision: "test-vision-model" },
    });

    await context.generate({
      prompt: "Test prompt",
      messages: [{ role: "user", content: "Hello" }],
      model: "text" as const,
      autoReportTokens: false,
    });

    expect(mockReportTokens).not.toHaveBeenCalled();
  });

  it("should convert string messages to OpenAI format", async () => {
    const context = createAIContext({
      signal: mockSignal,
      reportTokens: mockReportTokens as (usage: TokenUsage) => void,
      getClient: () => mockClient,
      modelConfig: { text: "test-text-model", vision: "test-vision-model" },
    });

    await context.generate({
      prompt: "Test prompt",
      messages: [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi there" },
      ],
      model: "text" as const,
    });

    const callArgs = getGenerateContentCall();
    const messages = callArgs[1];

    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({ role: "user", content: "Hello" });
    expect(messages[1]).toMatchObject({ role: "assistant", content: "Hi there" });
  });

  it("omits usage when the client response does not include token usage", async () => {
    mockGenerateContent.mockResolvedValueOnce({
      content: '{"result": "test"}',
    });

    const context = createAIContext({
      signal: mockSignal,
      reportTokens: mockReportTokens as (usage: TokenUsage) => void,
      getClient: () => mockClient,
      modelConfig: { text: "test-text-model", vision: "test-vision-model" },
    });

    const result = await context.generate({
      prompt: "Test prompt",
      messages: [{ role: "user", content: "Hello" }],
      model: "text" as const,
    });

    expect(Object.hasOwn(result, "usage")).toBe(false);
    expect(mockReportTokens).not.toHaveBeenCalled();
  });

  it("should handle requireJson option", async () => {
    // Mock for successful JSON extraction
    mockGenerateContent.mockResolvedValue({
      content: '{"result": "test"}',
      usage: { promptTokens: 100, completionTokens: 50 },
    });

    const context = createAIContext({
      signal: mockSignal,
      reportTokens: mockReportTokens as (usage: TokenUsage) => void,
      getClient: () => mockClient,
      modelConfig: { text: "test-text-model", vision: "test-vision-model" },
    });

    const result = await context.generate({
      prompt: "Test prompt",
      messages: [{ role: "user", content: "Hello" }],
      model: "text" as const,
      requireJson: true,
    });

    expect(result.content).toBe('{"result": "test"}');
  });
});
