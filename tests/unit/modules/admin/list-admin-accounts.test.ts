import { describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { getTestDb } from "tests/setup";
import { accounts, users } from "@/persistence";
import { listAdminAccounts } from "@/modules/admin/queries";
import { UserRole } from "@/modules/admin/types";

const { requireSuperAdminMock } = vi.hoisted(() => ({
  requireSuperAdminMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  get db() {
    return getTestDb();
  },
}));

vi.mock("@/modules/admin/access", () => ({
  requireSuperAdmin: requireSuperAdminMock,
}));

describe("listAdminAccounts", () => {
  it("requires super-admin access", async () => {
    requireSuperAdminMock.mockRejectedValueOnce(new Error("forbidden"));
    await expect(listAdminAccounts()).rejects.toThrow("forbidden");
  });

  it("returns accounts with user email enrichment", async () => {
    const db = getTestDb();
    requireSuperAdminMock.mockResolvedValueOnce({
      id: "admin-user",
      email: "admin@example.com",
      name: "Owner",
      role: UserRole.SuperAdmin,
    });

    await db.run(sql`DELETE FROM accounts`);
    await db.run(sql`DELETE FROM users`);

    await db.insert(users).values({
      id: "user-1",
      email: "owner@example.com",
      emailVerified: new Date(),
      name: "Owner",
      role: UserRole.SuperAdmin,
    });

    await db.insert(accounts).values([
      {
        userId: "user-1",
        provider: "google",
        providerAccountId: "google-123",
        type: "oauth",
      },
      {
        userId: "user-1",
        provider: "github",
        providerAccountId: "github-456",
        type: "oauth",
      },
    ]);

    const result = await listAdminAccounts();

    expect(result.items.map((item) => item.provider)).toEqual(["github", "google"]);
    expect(result.items[0]).toMatchObject({ userEmail: "owner@example.com" });
    expect(result.availableProviders).toEqual(["github", "google"]);
    expect(result.hasAnyAccounts).toBe(true);
  });

  it("filters by provider", async () => {
    const db = getTestDb();
    requireSuperAdminMock.mockResolvedValueOnce({
      id: "admin-user",
      email: "admin@example.com",
      name: "Owner",
      role: UserRole.SuperAdmin,
    });

    await db.run(sql`DELETE FROM accounts`);
    await db.run(sql`DELETE FROM users`);

    await db.insert(users).values({
      id: "user-1",
      email: "owner@example.com",
      emailVerified: new Date(),
      name: "Owner",
      role: UserRole.SuperAdmin,
    });

    await db.insert(accounts).values([
      {
        userId: "user-1",
        provider: "google",
        providerAccountId: "google-123",
        type: "oauth",
      },
      {
        userId: "user-1",
        provider: "github",
        providerAccountId: "github-456",
        type: "oauth",
      },
    ]);

    const result = await listAdminAccounts({ provider: "google" });
    expect(result.items.map((item) => item.provider)).toEqual(["google"]);
  });
});
