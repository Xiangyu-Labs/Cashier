import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LedgerPort } from "@/application/contracts";

const ledgers = {} as LedgerPort;
const ledger = {
  id: "ledger-existing",
  userId: "user-1",
  settings: {},
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const { mockResolveSingleLedgerForUser } = vi.hoisted(() => ({
  mockResolveSingleLedgerForUser: vi.fn(),
}));

vi.mock("@/modules/workspace/application/use-cases/ensure-user-ledger", () => ({
  resolveSingleLedgerForUser: mockResolveSingleLedgerForUser,
}));

describe("resolveHome", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the single ledger id when a new book is initialized", async () => {
    const createdLedger = { ...ledger, id: "ledger-new" };
    mockResolveSingleLedgerForUser.mockResolvedValue({ ledger: createdLedger, created: true });

    const { resolveHome } = await import("@/modules/workspace/application/use-cases/resolve-home");
    const result = await resolveHome({ userId: "user-1", locale: "zh" }, ledgers);

    expect(result).toEqual({ ledger: createdLedger, created: true });
    expect(mockResolveSingleLedgerForUser).toHaveBeenCalledWith(
      { userId: "user-1", locale: "zh" },
      ledgers
    );
  });

  it("returns the existing single ledger id", async () => {
    mockResolveSingleLedgerForUser.mockResolvedValue({
      ledger,
      created: false,
    });

    const { resolveHome } = await import("@/modules/workspace/application/use-cases/resolve-home");
    const result = await resolveHome({ userId: "user-1", locale: "en" }, ledgers);

    expect(result).toEqual({ ledger, created: false });
    expect(mockResolveSingleLedgerForUser).toHaveBeenCalledWith(
      { userId: "user-1", locale: "en" },
      ledgers
    );
  });
});
