import { describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { getTestDb } from "tests/setup";
import { currencyRates } from "@/persistence";
import { listAdminCurrencyRates } from "@/modules/admin/queries";
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

describe("listAdminCurrencyRates", () => {
  it("requires super-admin access", async () => {
    requireSuperAdminMock.mockRejectedValueOnce(new Error("forbidden"));
    await expect(listAdminCurrencyRates({ limit: 50 })).rejects.toThrow("forbidden");
  });

  it("returns currency rates newest first", async () => {
    const db = getTestDb();
    requireSuperAdminMock.mockResolvedValueOnce({
      id: "admin-user",
      email: "admin@example.com",
      name: "Owner",
      role: UserRole.SuperAdmin,
    });

    await db.run(sql`DELETE FROM currency_rates`);

    await db.insert(currencyRates).values([
      {
        date: "2026-03-25",
        base: "EUR",
        rates: { CNY: 7.8, USD: 1.1 },
        updatedAt: new Date(),
      },
      {
        date: "2026-03-24",
        base: "EUR",
        rates: { CNY: 7.7, USD: 1.09 },
        updatedAt: new Date(),
      },
    ]);

    const result = await listAdminCurrencyRates({ limit: 50 });

    expect(result.items.map((item) => item.date)).toEqual(["2026-03-25", "2026-03-24"]);
    expect(result.items[0]).toMatchObject({ base: "EUR", rateCount: 2 });
    expect(result.hasAnyCurrencyRates).toBe(true);
  });

  it("returns nextCursor and supports pagination", async () => {
    const db = getTestDb();
    requireSuperAdminMock.mockResolvedValue({
      id: "admin-user",
      email: "admin@example.com",
      name: "Owner",
      role: UserRole.SuperAdmin,
    });

    await db.run(sql`DELETE FROM currency_rates`);

    await db.insert(currencyRates).values([
      {
        date: "2026-03-25",
        base: "EUR",
        rates: { CNY: 7.8, USD: 1.1 },
        updatedAt: new Date(),
      },
      {
        date: "2026-03-24",
        base: "EUR",
        rates: { CNY: 7.7, USD: 1.09 },
        updatedAt: new Date(),
      },
    ]);

    const firstPage = await listAdminCurrencyRates({ limit: 1 });
    expect(firstPage.items.map((item) => item.date)).toEqual(["2026-03-25"]);
    expect(firstPage.nextCursor).toBe("2026-03-25");

    const secondPage = await listAdminCurrencyRates({
      limit: 1,
      cursor: firstPage.nextCursor ?? undefined,
    });
    expect(secondPage.items.map((item) => item.date)).toEqual(["2026-03-24"]);
    expect(secondPage.nextCursor).toBeNull();
  });

  it("validates input and throws ValidationError for an invalid cursor", async () => {
    requireSuperAdminMock.mockResolvedValueOnce({
      id: "admin-user",
      email: "admin@example.com",
      name: "Owner",
      role: UserRole.SuperAdmin,
    });
    await expect(listAdminCurrencyRates({ cursor: "bad" })).rejects.toBeInstanceOf(ValidationError);
  });
});
