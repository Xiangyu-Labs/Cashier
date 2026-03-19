import { OpenAIClient } from "@/lib/ai/openai-client";
import { vi, describe, beforeEach, afterEach, it, expect } from "vitest";

const { mockCreate, mockOpenAI } = vi.hoisted(() => {
  const mockCreate = vi.fn();
  const mockOpenAI = vi.fn(function () {
    return {
      chat: {
        completions: {
          create: mockCreate,
        },
      },
    };
  });

  // Mock APIError class attached to the default export
  class MockAPIError extends Error {
    status: number | undefined;
    constructor(status: number | undefined, message: string) {
      super(message);
      this.status = status;
      this.name = "APIError";
    }
  }

  // Use unknown then intersection for safer casting than any
  (mockOpenAI as unknown as { APIError: typeof MockAPIError }).APIError = MockAPIError;

  return { mockCreate, mockOpenAI };
});

vi.mock("openai", () => {
  return {
    default: mockOpenAI,
  };
});

describe("OpenAIClient Retry Logic", () => {
  let client: OpenAIClient;

  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-key";
    process.env.AI_MAX_RETRIES = "2";
    process.env.AI_RETRY_DELAY_MS = "10";

    mockCreate.mockReset();
    mockOpenAI.mockClear();

    client = new OpenAIClient();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should return content on success", async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: "Success" } }],
    });

    const result = await client.generateContent("prompt", [], "test-model");
    expect(result.content).toBe("Success");
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it("omits usage when OpenAI does not return token usage", async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: "Success" } }],
    });

    const result = await client.generateContent("prompt", [], "test-model");

    expect(Object.hasOwn(result, "usage")).toBe(false);
  });

  it("should retry on retryable error and succeed", async () => {
    // We can use a generic Error here because my code checks `isRetryable || true` which falls back to retry unless it's a specific 4xx
    // But to be precise, let's use a 429 error
    const error = new Error("Rate limit 429");
    mockCreate
      .mockRejectedValueOnce(error) // Fail 1
      .mockResolvedValueOnce({
        choices: [{ message: { content: "Success after retry" } }],
      }); // Success 2

    const result = await client.generateContent("prompt", [], "test-model");
    expect(result.content).toBe("Success after retry");
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it("should exhaust retries and throw error", async () => {
    const error = new Error("Data parse error");
    mockCreate.mockRejectedValue(error);

    await expect(client.generateContent("prompt", [], "test-model")).rejects.toThrow(
      "Data parse error"
    );
    // Initial + 2 retries = 3 calls
    expect(mockCreate).toHaveBeenCalledTimes(3);
  });

  it("should retry on 5xx errors", async () => {
    const error = new Error("500 Internal Server Error");
    mockCreate.mockRejectedValueOnce(error).mockResolvedValueOnce({
      choices: [{ message: { content: "Recovered" } }],
    });

    const result = await client.generateContent("prompt", [], "test-model");
    expect(result.content).toBe("Recovered");
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it("should NOT retry on 400 Bad Request", async () => {
    const error = new (
      mockOpenAI as unknown as { APIError: new (status: number, message: string) => Error }
    ).APIError(400, "Bad Request");
    mockCreate.mockRejectedValueOnce(error);

    // My client might be using the global mock if not careful,
    // but beforeEach creates a new OpenAIClient() which should use the mocked 'openai' package.
    await expect(client.generateContent("prompt", [], "test-model")).rejects.toThrow("Bad Request");
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });
});
