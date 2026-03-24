import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTestDb } from "tests/setup";
import { users } from "@/persistence/schema/auth";
import { ForbiddenError, UnauthorizedError } from "@/lib/errors";
import { requireSuperAdmin } from "@/modules/admin/access";
import { UserRole } from "@/modules/admin/types";

const { authMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
}));

vi.mock("@/auth", () => ({
  auth: authMock,
}));

vi.mock("@/lib/db", () => ({
  get db() {
    return getTestDb();
  },
}));

describe("requireSuperAdmin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws UnauthorizedError when there is no session user", async () => {
    authMock.mockResolvedValue(null);

    await expect(requireSuperAdmin()).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("throws ForbiddenError for a logged-in non-admin", async () => {
    const db = getTestDb();
    const id = crypto.randomUUID();

    await db.insert(users).values({
      id,
      email: "plain-user@example.com",
      emailVerified: new Date(),
      role: UserRole.User,
    });

    authMock.mockResolvedValue({ user: { id } });

    await expect(requireSuperAdmin()).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("throws UnauthorizedError for a deleted session user", async () => {
    const db = getTestDb();
    const id = crypto.randomUUID();

    await db.insert(users).values({
      id,
      email: "deleted-admin@example.com",
      emailVerified: new Date(),
      role: UserRole.SuperAdmin,
      deletedAt: new Date(),
    });

    authMock.mockResolvedValue({ user: { id } });

    await expect(requireSuperAdmin()).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("returns the actor for a valid super_admin", async () => {
    const db = getTestDb();
    const id = crypto.randomUUID();

    await db.insert(users).values({
      id,
      email: "owner@example.com",
      name: "Owner",
      emailVerified: new Date(),
      role: UserRole.SuperAdmin,
    });

    authMock.mockResolvedValue({ user: { id } });

    await expect(requireSuperAdmin()).resolves.toMatchObject({
      id,
      email: "owner@example.com",
      name: "Owner",
      role: UserRole.SuperAdmin,
    });
  });
});
