import { describe, it, expect, vi, beforeEach } from "vitest";
import { UnauthorizedError } from "@/lib/errors";

// mock withLedgerAccess — 返回一个会 throw UnauthorizedError 的 wrapper
vi.mock("@/modules/ledger/access", () => ({
  withLedgerAccess: vi.fn((action) => {
    return async (ledgerId: string, ...args: unknown[]) => {
      if (ledgerId === "unauthorized-ledger") {
        throw new UnauthorizedError("Unauthorized");
      }
      return action(ledgerId, ...args);
    };
  }),
  requireLedgerAccess: vi.fn(),
}));

vi.mock("@/modules/ledger/queries", () => ({
  getLedgerEntryDetail: vi.fn().mockResolvedValue({ id: "entry-1", title: "Test" }),
}));

describe("getLedgerEntryAction", () => {
  beforeEach(() => vi.clearAllMocks());

  it("throws UnauthorizedError for unauthorized ledger", async () => {
    const { getLedgerEntryAction } = await import("@/modules/ledger/server-actions/get-entry");
    await expect(getLedgerEntryAction("unauthorized-ledger", "entry-1")).rejects.toBeInstanceOf(
      UnauthorizedError
    );
  });

  it("returns entry for authorized ledger", async () => {
    const { getLedgerEntryAction } = await import("@/modules/ledger/server-actions/get-entry");
    const result = await getLedgerEntryAction("valid-ledger", "entry-1");
    expect(result).toEqual({ id: "entry-1", title: "Test" });
  });
});
