import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LedgerPort, UserAccountPort } from "@/application/contracts";

const ensureUserLedgerMock = vi.hoisted(() => vi.fn());
vi.mock("@/modules/workspace/application/use-cases/ensure-user-ledger", () => ({
  resolveSingleLedgerForUser: ensureUserLedgerMock,
}));

import { authenticateDevUser } from "@/modules/auth/application/use-cases/authenticate-dev-user";

const user = {
  id: "dev-user-1",
  email: "dev@cashier.local",
  name: "Local Developer",
  image: null,
};

describe("authenticateDevUser", () => {
  const findOrCreate = vi.fn();
  const users = { findOrCreate } as unknown as UserAccountPort;
  const ledgers = {} as LedgerPort;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DEV_AUTH_BYPASS = "true";
    (process.env as Record<string, string | undefined>).NODE_ENV = "development";
    findOrCreate.mockResolvedValue({ user, isExistingUser: true });
    ensureUserLedgerMock.mockResolvedValue({ ledgerId: "ledger-dev", created: false });
  });

  it("rejects when the flag is not enabled", async () => {
    process.env.DEV_AUTH_BYPASS = "false";
    await expect(authenticateDevUser({ locale: "zh-CN" }, { users, ledgers })).resolves.toBeNull();
  });

  it("rejects in production even when the flag is set", async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    await expect(authenticateDevUser({ locale: "zh-CN" }, { users, ledgers })).resolves.toBeNull();
  });

  it("uses the target user port and resolves the single ledger", async () => {
    const result = await authenticateDevUser({ locale: "en-US" }, { users, ledgers });
    expect(findOrCreate).toHaveBeenCalledWith("dev@cashier.local", "Local Developer");
    expect(result).toEqual({ ...user, locale: "en-US" });
    expect(ensureUserLedgerMock).toHaveBeenCalledWith(
      { userId: user.id, locale: "en-US" },
      ledgers
    );
  });
});
