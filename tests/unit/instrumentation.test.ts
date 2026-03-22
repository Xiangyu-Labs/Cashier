import { beforeEach, describe, expect, it, vi } from "vitest";

const logger = {
  info: vi.fn(),
  error: vi.fn(),
};

const initializeDefaultFlowRuntime = vi.fn();
const resetFlowRuntime = vi.fn();
const validateStartupEnv = vi.fn(() => ({
  DATABASE_URL: "file:./data/sqlite.db",
}));

vi.mock("@/lib/logger", () => ({
  logger,
}));

vi.mock("@/lib/flow/runtime", () => ({
  initializeDefaultFlowRuntime,
  resetFlowRuntime,
}));

vi.mock("@/lib/env/startup", () => ({
  validateStartupEnv,
}));

describe("instrumentation.register", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_RUNTIME = "nodejs";
  });

  it("validates startup env before initializing the flow runtime", async () => {
    const { register } = await import("@/instrumentation");

    await register();

    expect(validateStartupEnv).toHaveBeenCalledTimes(1);
    expect(validateStartupEnv.mock.invocationCallOrder[0]).toBeLessThan(
      initializeDefaultFlowRuntime.mock.invocationCallOrder[0]
    );
  });

  it("rethrows when runtime initialization fails", async () => {
    initializeDefaultFlowRuntime.mockRejectedValueOnce(new Error("runtime failed"));
    const { register } = await import("@/instrumentation");

    await expect(register()).rejects.toThrow("runtime failed");
    expect(logger.error).toHaveBeenCalled();
  });

  it("rethrows startup env validation failures without initializing the runtime", async () => {
    validateStartupEnv.mockImplementationOnce(() => {
      throw new Error("invalid env");
    });

    const { register } = await import("@/instrumentation");

    await expect(register()).rejects.toThrow("invalid env");
    expect(initializeDefaultFlowRuntime).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalled();
  });
});
