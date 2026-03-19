import { beforeEach, describe, expect, it, vi } from "vitest";

const logger = {
  info: vi.fn(),
  error: vi.fn(),
};

const initializeDefaultFlowRuntime = vi.fn();
const resetFlowRuntime = vi.fn();

vi.mock("@/lib/logger", () => ({
  logger,
}));

vi.mock("@/lib/flow/runtime", () => ({
  initializeDefaultFlowRuntime,
  resetFlowRuntime,
}));

describe("instrumentation.register", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_RUNTIME = "nodejs";
  });

  it("rethrows when runtime initialization fails", async () => {
    initializeDefaultFlowRuntime.mockRejectedValueOnce(new Error("runtime failed"));
    const { register } = await import("@/instrumentation");

    await expect(register()).rejects.toThrow("runtime failed");
    expect(logger.error).toHaveBeenCalled();
  });
});
