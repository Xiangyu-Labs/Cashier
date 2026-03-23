import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockFindMany, mockCreateDefaultLedger, loggerMock } = vi.hoisted(() => ({
  mockFindMany: vi.fn(),
  mockCreateDefaultLedger: vi.fn(),
  loggerMock: {
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      ledgers: {
        findMany: mockFindMany,
      },
    },
  },
}));

vi.mock("@/modules/ledger/use-cases", () => ({
  createDefaultLedger: mockCreateDefaultLedger,
}));

vi.mock("@/lib/logger", () => ({
  logger: loggerMock,
}));

describe("ensureUserLedger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns existing ledger without creating a new one", async () => {
    mockFindMany.mockResolvedValue([{ id: "ledger-existing" }]);

    const { ensureUserLedger } =
      await import("@/modules/workspace/application/use-cases/ensure-user-ledger");
    const result = await ensureUserLedger({ userId: "user-1" });

    expect(result).toEqual({ ledgerId: "ledger-existing", created: false });
    expect(mockCreateDefaultLedger).not.toHaveBeenCalled();
  });

  it("creates a ledger when none exists", async () => {
    mockFindMany.mockResolvedValue([]);
    mockCreateDefaultLedger.mockResolvedValue({ id: "ledger-new" });

    const { ensureUserLedger } =
      await import("@/modules/workspace/application/use-cases/ensure-user-ledger");
    const result = await ensureUserLedger({ userId: "user-1", locale: "en" });

    expect(result).toEqual({ ledgerId: "ledger-new", created: true });
    expect(mockCreateDefaultLedger).toHaveBeenCalledWith({ userId: "user-1", locale: "en" });
  });

  it("logs when multiple active ledgers are found and returns the first one", async () => {
    mockFindMany.mockResolvedValue([{ id: "ledger-newer" }, { id: "ledger-older" }]);

    const { ensureUserLedger } =
      await import("@/modules/workspace/application/use-cases/ensure-user-ledger");
    const result = await ensureUserLedger({ userId: "user-1" });

    expect(result).toEqual({ ledgerId: "ledger-newer", created: false });
    expect(loggerMock.error).toHaveBeenCalledWith(
      { userId: "user-1", ledgerIds: ["ledger-newer", "ledger-older"] },
      "Expected at most one active ledger for user"
    );
  });

  it("recovers from concurrent unique-constraint creation race", async () => {
    const uniqueError = new Error("UNIQUE constraint failed: ledgers.user_id");
    mockFindMany.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: "ledger-race" }]);
    mockCreateDefaultLedger.mockRejectedValue(uniqueError);

    const { ensureUserLedger } =
      await import("@/modules/workspace/application/use-cases/ensure-user-ledger");
    const result = await ensureUserLedger({ userId: "user-1" });

    expect(result).toEqual({ ledgerId: "ledger-race", created: false });
    expect(loggerMock.warn).toHaveBeenCalledWith(
      { userId: "user-1", ledgerId: "ledger-race" },
      "Recovered from concurrent single-ledger initialization"
    );
  });

  it("rethrows unique-constraint error when no ledger can be recovered", async () => {
    const uniqueError = new Error("UNIQUE constraint failed: ledgers.user_id");
    mockFindMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    mockCreateDefaultLedger.mockRejectedValue(uniqueError);

    const { ensureUserLedger } =
      await import("@/modules/workspace/application/use-cases/ensure-user-ledger");

    await expect(ensureUserLedger({ userId: "user-1" })).rejects.toThrow(
      "UNIQUE constraint failed: ledgers.user_id"
    );
  });
});
