import { beforeEach, describe, expect, it, vi } from "vitest";

const logger = {
  info: vi.fn(),
  error: vi.fn(),
};

const validateStartupEnv = vi.fn(() => ({
  DATABASE_URL: "file:./data/sqlite.db",
  S3_BUCKET: "cashier-images",
}));

vi.mock("@/lib/logger", () => ({
  logger,
}));

vi.mock("@/lib/env/startup", () => ({
  validateStartupEnv,
}));

describe("instrumentation.register", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_RUNTIME = "nodejs";
  });

  it("validates startup env without installing process-global orchestration", async () => {
    const { register } = await import("@/instrumentation");

    await register();

    expect(validateStartupEnv).toHaveBeenCalledTimes(1);
  });

  it("rethrows startup env validation failures", async () => {
    validateStartupEnv.mockImplementationOnce(() => {
      throw new Error("invalid env");
    });

    const { register } = await import("@/instrumentation");

    await expect(register()).rejects.toThrow("invalid env");
    expect(logger.error).toHaveBeenCalled();
  });
});
