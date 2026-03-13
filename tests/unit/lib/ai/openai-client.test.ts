import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("openai-client", () => {
    const originalEnv = process.env.NODE_ENV;
    const originalApiKey = process.env.OPENAI_API_KEY;

    beforeEach(() => {
        vi.resetModules();
        process.env.OPENAI_API_KEY = "test-api-key";
    });

    afterEach(() => {
        (process.env as Record<string, string>).NODE_ENV = originalEnv ?? "test";
        process.env.OPENAI_API_KEY = originalApiKey;
    });

    it("should allow client creation in test environment", async () => {
        (process.env as Record<string, string>).NODE_ENV = "test";
        const { getOpenAIClient, resetOpenAIClient } = await import("@/lib/ai/openai-client");
        resetOpenAIClient();
        // Should not throw in test environment
        expect(() => getOpenAIClient()).not.toThrow();
    });

    it("should block client creation in production environment", async () => {
        (process.env as Record<string, string>).NODE_ENV = "production";
        const { getOpenAIClient, resetOpenAIClient } = await import("@/lib/ai/openai-client");
        resetOpenAIClient();
        // Should throw error about browser environment
        expect(() => getOpenAIClient()).toThrow("browser");
    });

    it("should block client creation in development environment", async () => {
        (process.env as Record<string, string>).NODE_ENV = "development";
        const { getOpenAIClient, resetOpenAIClient } = await import("@/lib/ai/openai-client");
        resetOpenAIClient();
        // Should throw error about browser environment
        expect(() => getOpenAIClient()).toThrow("browser");
    });
});
