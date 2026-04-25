import { describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { getTestDb } from "tests/setup";
import { entryCategories, ledgers, users } from "@/persistence";
import { listAdminCategories } from "@/modules/admin/queries";
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

describe("listAdminCategories", () => {
  it("requires super-admin access", async () => {
    requireSuperAdminMock.mockRejectedValueOnce(new Error("forbidden"));
    await expect(listAdminCategories()).rejects.toThrow("forbidden");
  });

  it("returns categories sorted by sortOrder", async () => {
    const db = getTestDb();
    requireSuperAdminMock.mockResolvedValueOnce({
      id: "admin-user",
      email: "admin@example.com",
      name: "Owner",
      role: UserRole.SuperAdmin,
    });

    await db.run(sql`DELETE FROM entry_categories`);
    await db.run(sql`DELETE FROM ledgers`);
    await db.run(sql`DELETE FROM users`);

    await db.insert(users).values({
      id: "user-1",
      email: "owner@example.com",
      emailVerified: new Date(),
      name: "Owner",
      role: UserRole.SuperAdmin,
    });

    await db.insert(ledgers).values({ id: "ledger-1", userId: "user-1", metadata: {} });

    await db.insert(entryCategories).values([
      {
        id: "cat-b",
        ledgerId: "ledger-1",
        name: "Category B",
        sortOrder: 2,
        createdAt: new Date("2026-03-25T10:00:00.000Z"),
      },
      {
        id: "cat-a",
        ledgerId: "ledger-1",
        name: "Category A",
        sortOrder: 1,
        createdAt: new Date("2026-03-24T10:00:00.000Z"),
      },
    ]);

    const result = await listAdminCategories();

    expect(result.items.map((item) => item.id)).toEqual(["cat-a", "cat-b"]);
    expect(result.items[0]).toMatchObject({ name: "Category A", sortOrder: 1, isEditable: true });
    expect(result.hasAnyCategories).toBe(true);
  });

  it("filters by ledgerId", async () => {
    const db = getTestDb();
    requireSuperAdminMock.mockResolvedValueOnce({
      id: "admin-user",
      email: "admin@example.com",
      name: "Owner",
      role: UserRole.SuperAdmin,
    });

    await db.run(sql`DELETE FROM entry_categories`);
    await db.run(sql`DELETE FROM ledgers`);
    await db.run(sql`DELETE FROM users`);

    await db.insert(users).values([
      {
        id: "user-1",
        email: "owner@example.com",
        emailVerified: new Date(),
        name: "Owner",
        role: UserRole.SuperAdmin,
      },
      {
        id: "user-2",
        email: "other@example.com",
        emailVerified: new Date(),
        name: "Other",
        role: UserRole.User,
      },
    ]);

    await db.insert(ledgers).values([
      { id: "ledger-1", userId: "user-1", metadata: {} },
      { id: "ledger-2", userId: "user-2", metadata: {} },
    ]);

    await db.insert(entryCategories).values([
      {
        id: "cat-a",
        ledgerId: "ledger-1",
        name: "Category A",
        sortOrder: 1,
        createdAt: new Date("2026-03-24T10:00:00.000Z"),
      },
      {
        id: "cat-b",
        ledgerId: "ledger-1",
        name: "Category B",
        sortOrder: 2,
        createdAt: new Date("2026-03-25T10:00:00.000Z"),
      },
      {
        id: "cat-other",
        ledgerId: "ledger-2",
        name: "Other Category",
        sortOrder: 0,
        createdAt: new Date(),
      },
    ]);

    const result = await listAdminCategories({ ledgerId: "ledger-1" });
    expect(result.items.map((item) => item.id)).toEqual(["cat-a", "cat-b"]);
    expect(result.hasAnyCategories).toBe(true);
  });
});
