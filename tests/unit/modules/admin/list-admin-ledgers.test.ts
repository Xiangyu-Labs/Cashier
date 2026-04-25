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
      { id: "user-range-1", email: "r1@example.com", emailVerified: new Date(), name: "R1", role: UserRole.User },
      { id: "user-range-2", email: "r2@example.com", emailVerified: new Date(), name: "R2", role: UserRole.User },
    ]);

    await db.insert(ledgers).values([
      {
        id: "ledger-in-range",
        userId: "user-range-1",
        metadata: {},
        createdAt: new Date("2026-03-25T11:00:00.000Z"),
      },
      {
        id: "ledger-out-of-range",
        userId: "user-range-2",
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
      { id: "user-pg-1", email: "p1@example.com", emailVerified: new Date(), name: "P1", role: UserRole.User },
      { id: "user-pg-2", email: "p2@example.com", emailVerified: new Date(), name: "P2", role: UserRole.User },
      { id: "user-pg-3", email: "p3@example.com", emailVerified: new Date(), name: "P3", role: UserRole.User },
    ]);

    await db.insert(ledgers).values([
      {
        id: "ledger-c",
        userId: "user-pg-1",
        metadata: {},
        createdAt: new Date("2026-03-25T12:00:00.000Z"),
      },
      {
        id: "ledger-b",
        userId: "user-pg-2",
        metadata: {},
        createdAt: new Date("2026-03-25T11:00:00.000Z"),
      },
      {
        id: "ledger-a",
        userId: "user-pg-3",
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
