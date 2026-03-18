import { beforeEach, describe, expect, it, vi } from "vitest";

const logger = {
  info: vi.fn(),
  error: vi.fn(),
};

const registerAllTasks = vi.fn();

vi.mock("@/lib/logger", () => ({
  logger,
}));

vi.mock("@/lib/flow/task-registry", () => ({
  registerAllTasks,
}));

describe("instrumentation.register", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_RUNTIME = "nodejs";
  });

  it("rethrows when task registration fails", async () => {
    registerAllTasks.mockRejectedValueOnce(new Error("registry failed"));
    const { register } = await import("@/instrumentation");

    await expect(register()).rejects.toThrow("registry failed");
    expect(logger.error).toHaveBeenCalled();
  });
});
