import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { pinoMock } = vi.hoisted(() => ({
  pinoMock: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

vi.mock("pino", () => ({
  default: pinoMock,
}));

const originalEnv = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

afterEach(() => {
  process.env = { ...originalEnv };
  vi.resetModules();
});

describe("logger", () => {
  it("does not require startup-only env when imported from a client-like module graph", async () => {
    process.env = {
      NODE_ENV: "development",
    };

    const loggerModule = await import("@/lib/logger");

    expect(loggerModule.logger).toBeDefined();
    expect(pinoMock).toHaveBeenCalledWith(
      expect.objectContaining({
        level: "info",
      })
    );
  });
});
