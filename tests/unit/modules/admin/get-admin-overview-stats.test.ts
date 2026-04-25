import { describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { getTestDb } from "tests/setup";
import { currencyRates, entryCategories, ledgers, otpTokens, serviceCredentials, users } from "@/persistence";
import { getAdminOverviewStats } from "@/modules/admin/queries";
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

describe("getAdminOverviewStats", () => {
  it("requires super-admin access", async () => {
    requireSuperAdminMock.mockRejectedValueOnce(new Error("forbidden"));
    await expect(getAdminOverviewStats()).rejects.toThrow("forbidden");
  });

  it("returns correct counts for all entities", async () => {
    const db = getTestDb();
    requireSuperAdminMock.mockResolvedValueOnce({
      id: "admin-user",
      email: "admin@example.com",
      name: "Owner",
      role: UserRole.SuperAdmin,
    });

    await db.run(sql`DELETE FROM otp_tokens`);
    await db.run(sql`DELETE FROM currency_rates`);
    await db.run(sql`DELETE FROM accounts`);
    await db.run(sql`DELETE FROM service_credentials`);
    await db.run(sql`DELETE FROM entry_categories`);
    await db.run(sql`DELETE FROM task_runs`);
    await db.run(sql`DELETE FROM source_documents`);
    await db.run(sql`DELETE FROM ledger_entries`);
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

    await db.insert(entryCategories).values({
      id: "cat-1",
      ledgerId: "ledger-1",
      name: "Food",
      sortOrder: 0,
      createdAt: new Date(),
    });

    await db.insert(serviceCredentials).values({
      id: "cred-1",
      key: "key-1",
      name: "API Key",
      ledgerId: "ledger-1",
      createdAt: new Date(),
    });

    await db.insert(currencyRates).values({
      date: "2026-03-25",
      base: "EUR",
      rates: { CNY: 7.8 },
      updatedAt: new Date(),
    });

    await db.insert(otpTokens).values({
      id: "otp-1",
      email: "user@example.com",
      tokenHash: "hash",
      expires: new Date(),
      createdAt: new Date(),
    });

    const result = await getAdminOverviewStats();

    expect(result.totalUsers).toBe(1);
    expect(result.totalLedgers).toBe(1);
    expect(result.totalCategories).toBe(1);
    expect(result.totalServiceCredentials).toBe(1);
    expect(result.totalAccounts).toBe(0);
    expect(result.totalCurrencyRates).toBe(1);
    expect(result.totalOTPTokens).toBe(1);
    expect(result.totalEntries).toBe(0);
    expect(result.totalSourceDocuments).toBe(0);
    expect(result.totalTasks).toBe(0);
  });
});
