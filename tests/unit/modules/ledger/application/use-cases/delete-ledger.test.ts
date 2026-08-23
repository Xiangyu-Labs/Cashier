import { describe, expect, it, vi } from "vitest";
import type { LedgerPort } from "@/application/contracts";
import { NotFoundError } from "@/lib/errors";
import { deleteLedger } from "@/modules/ledger/application/use-cases/delete-ledger";

function port(result: "deleted" | "already_deleted" | "forbidden" | "not_found") {
  return {
    deleteOwned: vi.fn().mockResolvedValue(result),
  } as unknown as LedgerPort;
}

describe("deleteLedger", () => {
  it("delegates atomic deletion to the target ledger port", async () => {
    const ledgers = port("deleted");
    await expect(deleteLedger("user-1", "ledger-1", ledgers)).resolves.toBeUndefined();
    expect(ledgers.deleteOwned).toHaveBeenCalledWith("ledger-1", "user-1");
  });

  it("is idempotent when the owned ledger is already deleted", async () => {
    await expect(
      deleteLedger("user-1", "ledger-1", port("already_deleted"))
    ).resolves.toBeUndefined();
  });

  it("rejects a foreign ledger", async () => {
    await expect(deleteLedger("user-1", "ledger-1", port("forbidden"))).rejects.toBeInstanceOf(
      NotFoundError
    );
  });

  it("reports a missing ledger", async () => {
    await expect(deleteLedger("user-1", "ledger-1", port("not_found"))).rejects.toBeInstanceOf(
      NotFoundError
    );
  });
});
