import { describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { getTestDb } from "tests/setup";
import { ledgers, serviceCredentials, users } from "@/persistence";
import { listAdminServiceCredentials } from "@/modules/admin/queries";
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

describe("listAdminServiceCredentials", () => {
  it("requires super-admin access", async () => {
    requireSuperAdminMock.mockRejectedValueOnce(new Error("forbidden"));
    await expect(listAdminServiceCredentials({ limit: 50 })).rejects.toThrow("forbidden");
  });

  it("returns credentials newest first with user email enrichment", async () => {
    const db = getTestDb();
    requireSuperAdminMock.mockResolvedValueOnce({
      id: "admin-user",
      email: "admin@example.com",
      name: "Owner",
      role: UserRole.SuperAdmin,
    });

    await db.run(sql`DELETE FROM service_credentials`);
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

    await db.insert(serviceCredentials).values([
      {
        id: "cred-new",
        key: "key-new",
        name: "New Credential",
        ledgerId: "ledger-1",
        createdAt: new Date("2026-03-25T10:00:00.000Z"),
      },
      {
        id: "cred-old",
        key: "key-old",
        name: "Old Credential",
        ledgerId: "ledger-1",
        createdAt: new Date("2026-03-24T10:00:00.000Z"),
      },
    ]);

    const result = await listAdminServiceCredentials({ limit: 50 });

    expect(result.items.map((item) => item.id)).toEqual(["cred-new", "cred-old"]);
    expect(result.items[0]).toMatchObject({ userEmail: "owner@example.com" });
    expect(result.hasAnyServiceCredentials).toBe(true);
  });

  it("returns nextCursor and supports pagination", async () => {
    getTestDb();
    requireSuperAdminMock.mockResolvedValue({
      id: "admin-user",
      email: "admin@example.com",
      name: "Owner",
      role: UserRole.SuperAdmin,
    });

    const firstPage = await listAdminServiceCredentials({ limit: 1 });
    expect(firstPage.items.map((item) => item.id)).toEqual(["cred-new"]);
    expect(firstPage.nextCursor).toBeTruthy();

    const secondPage = await listAdminServiceCredentials({
      limit: 1,
      cursor: firstPage.nextCursor ?? undefined,
    });
    expect(secondPage.items.map((item) => item.id)).toEqual(["cred-old"]);
    expect(secondPage.nextCursor).toBeNull();
  });

  it("validates input and throws ValidationError for an invalid cursor", async () => {
    requireSuperAdminMock.mockResolvedValueOnce({
      id: "admin-user",
      email: "admin@example.com",
      name: "Owner",
      role: UserRole.SuperAdmin,
    });
    await expect(listAdminServiceCredentials({ cursor: "bad" })).rejects.toBeInstanceOf(ValidationError);
  });
});
