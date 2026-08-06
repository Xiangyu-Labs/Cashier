import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LedgerPort } from "@/application/contracts";
import { ConflictError } from "@/lib/errors";
import { ensureUserLedger } from "@/modules/workspace/application/use-cases/ensure-user-ledger";

const loggerError = vi.hoisted(() => vi.fn());
vi.mock("@/lib/logger", () => ({
  logger: { error: loggerError, warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

function harness() {
  const listIdsForUser = vi.fn();
  const createDefault = vi.fn();
  return {
    listIdsForUser,
    createDefault,
    port: { listIdsForUser, createDefault } as unknown as LedgerPort,
  };
}

describe("ensureUserLedger", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns an existing ledger without creating another", async () => {
    const test = harness();
    test.listIdsForUser.mockResolvedValue(["ledger-existing"]);
    await expect(ensureUserLedger({ userId: "user-1" }, test.port)).resolves.toEqual({
      ledgerId: "ledger-existing",
      created: false,
    });
    expect(test.createDefault).not.toHaveBeenCalled();
  });

  it("creates the configured default ledger when none exists", async () => {
    const test = harness();
    test.listIdsForUser.mockResolvedValue([]);
    test.createDefault.mockResolvedValue({ id: "ledger-new" });
    await expect(ensureUserLedger({ userId: "user-1", locale: "en" }, test.port)).resolves.toEqual({
      ledgerId: "ledger-new",
      created: true,
    });
    expect(test.createDefault).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1", settings: expect.any(Object) })
    );
  });

  it("logs the invariant when multiple active ledgers exist", async () => {
    const test = harness();
    test.listIdsForUser.mockResolvedValue(["ledger-newer", "ledger-older"]);
    await ensureUserLedger({ userId: "user-1" }, test.port);
    expect(loggerError).toHaveBeenCalledWith(
      {
        userSubject: expect.stringMatching(/^user:[a-f0-9]{16}$/),
        ledgerSubjects: [
          expect.stringMatching(/^ledger:[a-f0-9]{16}$/),
          expect.stringMatching(/^ledger:[a-f0-9]{16}$/),
        ],
      },
      "Expected one active ledger"
    );
  });

  it("recovers an idempotent concurrent creation conflict", async () => {
    const test = harness();
    test.listIdsForUser.mockResolvedValueOnce([]).mockResolvedValueOnce(["ledger-race"]);
    test.createDefault.mockRejectedValue(new ConflictError("already exists"));
    await expect(ensureUserLedger({ userId: "user-1" }, test.port)).resolves.toEqual({
      ledgerId: "ledger-race",
      created: false,
    });
  });

  it("rethrows a conflict when no concurrent ledger exists", async () => {
    const test = harness();
    test.listIdsForUser.mockResolvedValue([]);
    test.createDefault.mockRejectedValue(new ConflictError("already exists"));
    await expect(ensureUserLedger({ userId: "user-1" }, test.port)).rejects.toThrow(ConflictError);
  });
});
