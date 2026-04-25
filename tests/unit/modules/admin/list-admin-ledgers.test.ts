import { describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { getTestDb } from "tests/setup";
import { ledgers, users } from "@/persistence";
import { listAdminLedgers } from "@/modules/admin/queries";
import { ValidationError } from "@/lib/errors";
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

describe("listAdminLedgers", () => {
  it("requires super-admin access before querying ledgers", async () => {
    requireSuperAdminMock.mockRejectedValueOnce(new Error("forbidden"));
    await expect(listAdminLedgers({ limit: 50 })).rejects.toThrow("forbidden");
  });

  it("returns newest ledgers first with user email enrichment", async () => {
    const db = getTestDb();
    requireSuperAdminMock.mockResolvedValueOnce({
      id: "admin-user",
      email: "admin@example.com",
      name: "Owner",
      role: UserRole.SuperAdmin,
    });

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
        email: "second@example.com",
        emailVerified: new Date(),
        name: "Second",
        role: UserRole.User,
      },
    ]);

    await db.insert(ledgers).values([
      {
        id: "ledger-new",
        userId: "user-1",
        metadata: { settings: { mainCurrency: "CNY" } },
        createdAt: new Date("2026-03-25T10:00:00.000Z"),
      },
      {
        id: "ledger-old",
        userId: "user-2",
        metadata: {},
        createdAt: new Date("2026-03-24T10:00:00.000Z"),
      },
    ]);

    const result = await listAdminLedgers({ limit: 50 });

    expect(result.items.map((item) => item.id)).toEqual(["ledger-new", "ledger-old"]);
    expect(result.items[0]).toMatchObject({ userEmail: "owner@example.com", mainCurrency: "CNY" });
    expect(result.hasAnyLedgers).toBe(true);
  });

  it("filters by time range", async () => {
    const db = getTestDb();
    requireSuperAdminMock.mockResolvedValueOnce({
      id: "admin-user",
      email: "admin@example.com",
      name: "Owner",
      role: UserRole.SuperAdmin,
    });

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-25T12:00:00.000Z"));

    await db.insert(users).values([
      {
        id: "user-in-range",
        email: "inrange@example.com",
        emailVerified: new Date(),
        name: "In Range",
        role: UserRole.User,
      },
      {
        id: "user-out-of-range",
        email: "outofrange@example.com",
        emailVerified: new Date(),
        name: "Out of Range",
        role: UserRole.User,
      },
    ]);

    await db.insert(ledgers).values([
      {
        id: "ledger-in-range",
        userId: "user-in-range",
        metadata: {},
        createdAt: new Date("2026-03-25T11:00:00.000Z"),
      },
      {
        id: "ledger-out-of-range",
        userId: "user-out-of-range",
        metadata: {},
        createdAt: new Date("2026-03-17T11:00:00.000Z"),
      },
    ]);

    const result = await listAdminLedgers({ range: "7d", limit: 50 });
    expect(result.items.map((item) => item.id)).toEqual(["ledger-in-range"]);

    vi.useRealTimers();
  });

  it("returns nextCursor and supports pagination", async () => {
    const db = getTestDb();
    requireSuperAdminMock.mockResolvedValue({
      id: "admin-user",
      email: "admin@example.com",
      name: "Owner",
      role: UserRole.SuperAdmin,
    });

    await db.insert(users).values([
      {
        id: "user-c",
        email: "c@example.com",
        emailVerified: new Date(),
        name: "C",
        role: UserRole.User,
      },
      {
        id: "user-b",
        email: "b@example.com",
        emailVerified: new Date(),
        name: "B",
        role: UserRole.User,
      },
      {
        id: "user-a",
        email: "a@example.com",
        emailVerified: new Date(),
        name: "A",
        role: UserRole.User,
      },
    ]);

    await db.insert(ledgers).values([
      {
        id: "ledger-c",
        userId: "user-c",
        metadata: {},
        createdAt: new Date("2026-03-25T12:00:00.000Z"),
      },
      {
        id: "ledger-b",
        userId: "user-b",
        metadata: {},
        createdAt: new Date("2026-03-25T11:00:00.000Z"),
      },
      {
        id: "ledger-a",
        userId: "user-a",
        metadata: {},
        createdAt: new Date("2026-03-25T10:00:00.000Z"),
      },
    ]);

    const firstPage = await listAdminLedgers({ limit: 2 });
    expect(firstPage.items.map((item) => item.id)).toEqual(["ledger-c", "ledger-b"]);
    expect(firstPage.nextCursor).toBeTruthy();

    const secondPage = await listAdminLedgers({ limit: 2, cursor: firstPage.nextCursor ?? undefined });
    expect(secondPage.items.map((item) => item.id)).toEqual(["ledger-a"]);
    expect(secondPage.nextCursor).toBeNull();
  });

  it("validates input and throws ValidationError for an invalid cursor", async () => {
    requireSuperAdminMock.mockResolvedValueOnce({
      id: "admin-user",
      email: "admin@example.com",
      name: "Owner",
      role: UserRole.SuperAdmin,
    });
    await expect(listAdminLedgers({ cursor: "bad-cursor" })).rejects.toBeInstanceOf(ValidationError);
  });
});
