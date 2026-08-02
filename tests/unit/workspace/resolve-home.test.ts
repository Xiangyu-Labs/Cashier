import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LedgerPort } from "@/application/contracts";

const ledgers = {} as LedgerPort;

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
    mockResolveSingleLedgerForUser.mockResolvedValue({ ledgerId: "ledger-new", created: true });

    const { resolveHome } = await import("@/modules/workspace/application/use-cases/resolve-home");
    const result = await resolveHome({ userId: "user-1", locale: "zh" }, ledgers);

    expect(result).toEqual({ ledgerId: "ledger-new", created: true });
    expect(mockResolveSingleLedgerForUser).toHaveBeenCalledWith(
      { userId: "user-1", locale: "zh" },
      ledgers
    );
  });

  it("returns the existing single ledger id", async () => {
    mockResolveSingleLedgerForUser.mockResolvedValue({
      ledgerId: "ledger-existing",
      created: false,
    });

    const { resolveHome } = await import("@/modules/workspace/application/use-cases/resolve-home");
    const result = await resolveHome({ userId: "user-1", locale: "en" }, ledgers);

    expect(result).toEqual({ ledgerId: "ledger-existing", created: false });
    expect(mockResolveSingleLedgerForUser).toHaveBeenCalledWith(
      { userId: "user-1", locale: "en" },
      ledgers
    );
  });
});
