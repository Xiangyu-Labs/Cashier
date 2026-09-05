import { describe, expect, it, vi } from "vitest";

const { cleanup, prepareTestPostgres } = vi.hoisted(() => ({
  cleanup: vi.fn(async () => {}),
  prepareTestPostgres: vi.fn(async () => ({
    databaseUrl: "postgresql://localhost/cashier_test",
    runId: "run-id",
    cleanup,
  })),
}));

vi.mock("../../../scripts/prepare-test-postgres.mjs", () => ({ prepareTestPostgres }));

import setup from "../../setup.postgres-global";

describe("PostgreSQL global setup", () => {
  it("provides serializable connection context and returns resource cleanup", async () => {
    const provide = vi.fn();
    const teardown = await setup({ provide } as never);

    expect(provide).toHaveBeenCalledWith("cashierPostgres", {
      databaseUrl: "postgresql://localhost/cashier_test",
      runId: "run-id",
    });
    await teardown();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it("releases the database resource when context provision fails", async () => {
    cleanup.mockClear();
    const failure = new Error("provide failed");

    await expect(
      setup({
        provide: vi.fn(() => {
          throw failure;
        }),
      } as never)
    ).rejects.toBe(failure);
    expect(cleanup).toHaveBeenCalledTimes(1);
  });
});
