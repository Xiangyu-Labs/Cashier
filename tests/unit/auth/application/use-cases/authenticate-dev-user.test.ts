import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserAccountPort } from "@/application/contracts";

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

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DEV_AUTH_BYPASS = "true";
    (process.env as Record<string, string | undefined>).NODE_ENV = "development";
    findOrCreate.mockResolvedValue({ user, isExistingUser: true });
  });

  it("rejects when the flag is not enabled", async () => {
    process.env.DEV_AUTH_BYPASS = "false";
    await expect(authenticateDevUser({ locale: "zh-CN" }, { users })).resolves.toBeNull();
  });

  it("rejects in production even when the flag is set", async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    await expect(authenticateDevUser({ locale: "zh-CN" }, { users })).resolves.toBeNull();
  });

  it("returns the principal through the target user port", async () => {
    const result = await authenticateDevUser({ locale: "en-US" }, { users });
    expect(findOrCreate).toHaveBeenCalledWith("dev@cashier.local", "Local Developer");
    expect(result).toEqual({ ...user, locale: "en-US", isNewUser: false });
  });
});
