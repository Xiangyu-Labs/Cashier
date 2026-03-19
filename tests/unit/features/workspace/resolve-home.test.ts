import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockEnsureUserLedger } = vi.hoisted(() => ({
  mockEnsureUserLedger: vi.fn(),
}));

vi.mock("@/modules/workspace/application/use-cases/ensure-user-ledger", () => ({
  ensureUserLedger: mockEnsureUserLedger,
}));

describe("resolveHome", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns redirect-created when a new ledger is initialized", async () => {
    mockEnsureUserLedger.mockResolvedValue({ ledgerId: "ledger-new", created: true });

    const { resolveHome } = await import("@/modules/workspace/application/use-cases/resolve-home");
    const result = await resolveHome({ userId: "user-1", locale: "zh" });

    expect(result).toEqual({ kind: "redirect-created", ledgerId: "ledger-new" });
    expect(mockEnsureUserLedger).toHaveBeenCalledWith({ userId: "user-1", locale: "zh" });
  });

  it("returns redirect-existing when the user already has a ledger", async () => {
    mockEnsureUserLedger.mockResolvedValue({ ledgerId: "ledger-existing", created: false });

    const { resolveHome } = await import("@/modules/workspace/application/use-cases/resolve-home");
    const result = await resolveHome({ userId: "user-1", locale: "en" });

    expect(result).toEqual({ kind: "redirect-existing", ledgerId: "ledger-existing" });
    expect(mockEnsureUserLedger).toHaveBeenCalledWith({ userId: "user-1", locale: "en" });
  });
});
