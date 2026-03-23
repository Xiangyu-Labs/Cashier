import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForbiddenError, NotFoundError } from "@/lib/errors";

const {
  ledgersFindFirstMock,
  txOperations,
  txUpdateMock,
  transactionMock,
  updateTagMock,
} = vi.hoisted(() => {
  const txOperations: Array<{ table: unknown; values: unknown; where: unknown }> = [];
  const txUpdateMock = vi.fn((table: unknown) => ({
    set: (values: unknown) => ({
      where: (where: unknown) => ({
        run: () => {
          txOperations.push({ table, values, where });
        },
      }),
    }),
  }));
  const txMock = {
    update: txUpdateMock,
  };

  return {
    ledgersFindFirstMock: vi.fn(),
    txOperations,
    txUpdateMock,
    transactionMock: vi.fn((callback: (tx: typeof txMock) => unknown) => callback(txMock)),
    updateTagMock: vi.fn(),
  };
});

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      ledgers: {
        findFirst: ledgersFindFirstMock,
      },
    },
    transaction: transactionMock,
  },
}));

vi.mock("@/lib/db/scoped-query", () => ({
  forLedger: vi.fn((table: unknown, ledgerId: string) => ({
    whereActive: { whereActive: [table, ledgerId] },
    softDelete: { deletedAt: new Date("2026-03-20T00:00:00.000Z") },
  })),
}));

vi.mock("@/persistence", () => ({
  ledgers: {
    id: "ledgers.id",
    userId: "ledgers.userId",
    deletedAt: "ledgers.deletedAt",
  },
  ledgerEntries: "ledgerEntries",
  entryCategories: "entryCategories",
  sourceDocuments: {
    ledgerId: "sourceDocuments.ledgerId",
    status: "sourceDocuments.status",
  },
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...parts: unknown[]) => ({ and: parts })),
  eq: vi.fn((left: unknown, right: unknown) => ({ eq: [left, right] })),
  isNull: vi.fn((column: unknown) => ({ isNull: column })),
  ne: vi.fn((left: unknown, right: unknown) => ({ ne: [left, right] })),
}));

vi.mock("next/cache", () => ({
  updateTag: updateTagMock,
}));

import { deleteLedger } from "@/modules/ledger/application/use-cases/delete-ledger";

describe("deleteLedger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    txOperations.length = 0;
  });

  it("deletes an active ledger found by id + userId + deletedAt is null", async () => {
    ledgersFindFirstMock.mockResolvedValueOnce({
      id: "ledger-1",
      userId: "user-1",
      deletedAt: null,
    });

    await deleteLedger("user-1", "ledger-1");

    expect(ledgersFindFirstMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: {
          and: [
            { eq: ["ledgers.id", "ledger-1"] },
            { eq: ["ledgers.userId", "user-1"] },
            { isNull: "ledgers.deletedAt" },
          ],
        },
      })
    );
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(txUpdateMock).toHaveBeenCalledTimes(4);
    expect(updateTagMock).toHaveBeenCalledWith("ledger");
  });

  it("returns silently when the owned ledger is already soft deleted", async () => {
    ledgersFindFirstMock.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: "ledger-1",
      deletedAt: new Date("2026-03-20T00:00:00.000Z"),
    });

    await expect(deleteLedger("user-1", "ledger-1")).resolves.toBeUndefined();

    expect(ledgersFindFirstMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: {
          and: [
            { eq: ["ledgers.id", "ledger-1"] },
            { eq: ["ledgers.userId", "user-1"] },
            { isNull: "ledgers.deletedAt" },
          ],
        },
      })
    );
    expect(ledgersFindFirstMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: {
          and: [
            { eq: ["ledgers.id", "ledger-1"] },
            { eq: ["ledgers.userId", "user-1"] },
          ],
        },
        columns: { id: true, deletedAt: true },
      })
    );
    expect(transactionMock).not.toHaveBeenCalled();
    expect(updateTagMock).not.toHaveBeenCalled();
  });

  it("throws ForbiddenError when another user's ledger exists", async () => {
    ledgersFindFirstMock
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "ledger-1" });

    await expect(deleteLedger("user-1", "ledger-1")).rejects.toBeInstanceOf(ForbiddenError);

    expect(ledgersFindFirstMock).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        where: { eq: ["ledgers.id", "ledger-1"] },
        columns: { id: true },
      })
    );
    expect(transactionMock).not.toHaveBeenCalled();
    expect(updateTagMock).not.toHaveBeenCalled();
  });

  it("throws NotFoundError when no ledger exists for the id", async () => {
    ledgersFindFirstMock.mockResolvedValueOnce(null).mockResolvedValueOnce(null).mockResolvedValueOnce(null);

    await expect(deleteLedger("user-1", "ledger-1")).rejects.toBeInstanceOf(NotFoundError);

    expect(ledgersFindFirstMock).toHaveBeenCalledTimes(3);
    expect(transactionMock).not.toHaveBeenCalled();
    expect(updateTagMock).not.toHaveBeenCalled();
  });
});
