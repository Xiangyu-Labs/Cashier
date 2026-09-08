import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LedgerPort } from "@/application/contracts";
import { ConflictError } from "@/lib/errors";
import { ensureUserLedger } from "@/modules/workspace/application/use-cases/ensure-user-ledger";

const loggerError = vi.hoisted(() => vi.fn());
vi.mock("@/lib/logger", () => ({
  logger: { error: loggerError, warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

function harness() {
  const listForUser = vi.fn();
  const createDefault = vi.fn();
  return {
    listForUser,
    createDefault,
    port: { listForUser, createDefault } as unknown as LedgerPort,
  };
}

function ledger(id: string) {
  return {
    id,
    userId: "user-1",
    settings: { mainCurrency: "USD" },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("ensureUserLedger", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns an existing ledger without creating another", async () => {
    const test = harness();
    test.listForUser.mockResolvedValue([ledger("ledger-existing")]);
    await expect(ensureUserLedger({ userId: "user-1" }, test.port)).resolves.toEqual({
      ledger: ledger("ledger-existing"),
      created: false,
    });
    expect(test.createDefault).not.toHaveBeenCalled();
  });

  it("creates the configured default ledger when none exists", async () => {
    const test = harness();
    test.listForUser.mockResolvedValue([]);
    test.createDefault.mockResolvedValue(ledger("ledger-new"));
    await expect(ensureUserLedger({ userId: "user-1", locale: "en" }, test.port)).resolves.toEqual({
      ledger: ledger("ledger-new"),
      created: true,
    });
    expect(test.createDefault).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1", settings: expect.any(Object) })
    );
  });

  it("logs the invariant when multiple active ledgers exist", async () => {
    const test = harness();
    test.listForUser.mockResolvedValue([ledger("ledger-newer"), ledger("ledger-older")]);
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
    test.listForUser.mockResolvedValueOnce([]).mockResolvedValueOnce([ledger("ledger-race")]);
    test.createDefault.mockRejectedValue(new ConflictError("already exists"));
    await expect(ensureUserLedger({ userId: "user-1" }, test.port)).resolves.toEqual({
      ledger: ledger("ledger-race"),
      created: false,
    });
  });

  it("rethrows a conflict when no concurrent ledger exists", async () => {
    const test = harness();
    test.listForUser.mockResolvedValue([]);
    test.createDefault.mockRejectedValue(new ConflictError("already exists"));
    await expect(ensureUserLedger({ userId: "user-1" }, test.port)).rejects.toThrow(ConflictError);
  });
});
