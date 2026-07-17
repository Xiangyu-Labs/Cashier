import { beforeEach, describe, expect, it, vi } from "vitest";

const logger = {
  info: vi.fn(),
  error: vi.fn(),
};

const initializeDefaultTaskRuntime = vi.fn();
const initializeCurrentProcessingDispatcher = vi.fn();
const resetTaskRuntime = vi.fn();
const initializeExchangeRateLedgerRecalculationOrchestration = vi.fn();
const validateStartupEnv = vi.fn(() => ({
  DATABASE_URL: "file:./data/sqlite.db",
}));

vi.mock("@/lib/logger", () => ({
  logger,
}));

vi.mock("@/lib/tasks/runtime", () => ({
  initializeDefaultTaskRuntime,
  resetTaskRuntime,
}));

vi.mock("@/application/adapters/in-process", () => ({
  initializeCurrentProcessingDispatcher,
}));

vi.mock("@/lib/orchestration/exchange-rate-ledger-recalculation", () => ({
  initializeExchangeRateLedgerRecalculationOrchestration,
}));

vi.mock("@/lib/env/startup", () => ({
  validateStartupEnv,
}));

describe("instrumentation.register", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_RUNTIME = "nodejs";
  });

  it("validates startup env before initializing target processing", async () => {
    const { register } = await import("@/instrumentation");

    await register();

    expect(validateStartupEnv).toHaveBeenCalledTimes(1);
    const validateOrder = validateStartupEnv.mock.invocationCallOrder.at(0);
    const initializeOrder = initializeCurrentProcessingDispatcher.mock.invocationCallOrder.at(0);

    expect(validateOrder).toBeDefined();
    expect(initializeOrder).toBeDefined();
    expect(validateOrder!).toBeLessThan(initializeOrder!);
    expect(initializeExchangeRateLedgerRecalculationOrchestration).toHaveBeenCalledTimes(1);
    expect(initializeCurrentProcessingDispatcher).toHaveBeenCalledTimes(1);
    expect(initializeDefaultTaskRuntime).not.toHaveBeenCalled();

    const orchestrationOrder =
      initializeExchangeRateLedgerRecalculationOrchestration.mock.invocationCallOrder.at(0);
    expect(orchestrationOrder).toBeDefined();
    expect(initializeOrder!).toBeLessThan(orchestrationOrder!);
  });

  it("rethrows when target processing initialization fails", async () => {
    initializeCurrentProcessingDispatcher.mockRejectedValueOnce(new Error("runtime failed"));
    const { register } = await import("@/instrumentation");

    await expect(register()).rejects.toThrow("runtime failed");
    expect(initializeExchangeRateLedgerRecalculationOrchestration).not.toHaveBeenCalled();
    expect(initializeDefaultTaskRuntime).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalled();
  });

  it("rethrows startup env validation failures without initializing the runtime", async () => {
    validateStartupEnv.mockImplementationOnce(() => {
      throw new Error("invalid env");
    });

    const { register } = await import("@/instrumentation");

    await expect(register()).rejects.toThrow("invalid env");
    expect(initializeDefaultTaskRuntime).not.toHaveBeenCalled();
    expect(initializeCurrentProcessingDispatcher).not.toHaveBeenCalled();
    expect(initializeExchangeRateLedgerRecalculationOrchestration).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalled();
  });
});
