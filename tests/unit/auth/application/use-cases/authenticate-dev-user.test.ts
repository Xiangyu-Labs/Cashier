import { beforeEach, describe, expect, it, vi } from "vitest";

const findFirstMock = vi.hoisted(() => vi.fn());
const insertValuesMock = vi.hoisted(() => vi.fn());
const insertReturningMock = vi.hoisted(() => vi.fn());
const insertMock = vi.hoisted(() => vi.fn());
const ensureUserLedgerMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      users: {
        findFirst: findFirstMock,
      },
    },
    insert: insertMock,
  },
}));

vi.mock("@/persistence/schema/auth", () => ({
  users: {
    email: "email",
    deletedAt: "deletedAt",
  },
}));

vi.mock("@/modules/workspace/application/use-cases/ensure-user-ledger", () => ({
  resolveSingleLedgerForUser: ensureUserLedgerMock,
}));

describe("authenticateDevUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    process.env.DEV_AUTH_BYPASS = "true";
    process.env.NODE_ENV = "development";

    insertReturningMock.mockResolvedValue([
      {
        id: "dev-user-1",
        email: "dev@cashier.local",
        name: "Local Developer",
        image: null,
      },
    ]);
    insertValuesMock.mockReturnValue({ returning: insertReturningMock });
    insertMock.mockReturnValue({ values: insertValuesMock });
    ensureUserLedgerMock.mockResolvedValue({ ledgerId: "ledger-dev", created: false });
  });

  it("rejects when the flag is not enabled", async () => {
    process.env.DEV_AUTH_BYPASS = "false";

    const { authenticateDevUser } = await import(
      "@/modules/auth/application/use-cases/authenticate-dev-user"
    );

    await expect(authenticateDevUser({ locale: "zh-CN" })).resolves.toBeNull();
  });

  it("rejects in production even when the flag is set", async () => {
    process.env.NODE_ENV = "production";

    const { authenticateDevUser } = await import(
      "@/modules/auth/application/use-cases/authenticate-dev-user"
    );

    await expect(authenticateDevUser({ locale: "zh-CN" })).resolves.toBeNull();
  });

  it("reuses an existing dev user and resolves the single ledger", async () => {
    findFirstMock.mockResolvedValue({
      id: "dev-user-1",
      email: "dev@cashier.local",
      name: "Local Developer",
      image: null,
    });

    const { authenticateDevUser } = await import(
      "@/modules/auth/application/use-cases/authenticate-dev-user"
    );

    const result = await authenticateDevUser({ locale: "en-US" });

    expect(result).toEqual({
      id: "dev-user-1",
      email: "dev@cashier.local",
      name: "Local Developer",
      image: null,
      locale: "en-US",
    });
    expect(ensureUserLedgerMock).toHaveBeenCalledWith({
      userId: "dev-user-1",
      locale: "en-US",
    });
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("creates the deterministic dev user when missing", async () => {
    findFirstMock.mockResolvedValue(null);

    const { authenticateDevUser } = await import(
      "@/modules/auth/application/use-cases/authenticate-dev-user"
    );

    const result = await authenticateDevUser({ locale: "zh-CN" });

    expect(insertValuesMock).toHaveBeenCalledWith({
      email: "dev@cashier.local",
      name: "Local Developer",
      emailVerified: expect.any(Date),
    });
    expect(result?.id).toBe("dev-user-1");
    expect(ensureUserLedgerMock).toHaveBeenCalledWith({
      userId: "dev-user-1",
      locale: "zh-CN",
    });
  });
});
