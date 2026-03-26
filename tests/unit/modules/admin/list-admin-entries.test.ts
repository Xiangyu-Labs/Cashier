import { describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { getTestDb } from "tests/setup";
import { entryCategories, ledgerEntries, ledgers, users } from "@/persistence";
import { listAdminEntries } from "@/modules/admin/queries";
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

describe("listAdminEntries", () => {
  it("requires super-admin access before querying entries", async () => {
    requireSuperAdminMock.mockRejectedValueOnce(new Error("forbidden"));

    await expect(listAdminEntries({ limit: 50 })).rejects.toThrow("forbidden");
  });

  it("returns newest entries first and enriches rows with user email and category name", async () => {
    const db = getTestDb();
    requireSuperAdminMock.mockResolvedValueOnce({
      id: "admin-user",
      email: "admin@example.com",
      name: "Owner",
      role: UserRole.SuperAdmin,
    });

    await db.run(sql`DELETE FROM ledger_entries`);
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
    await db.insert(entryCategories).values({
      id: "category-1",
      ledgerId: "ledger-1",
      name: "Meals",
      sortOrder: 1,
    });

    await db.insert(ledgerEntries).values([
      {
        id: "entry-new",
        ledgerId: "ledger-1",
        categoryId: "category-1",
        sourceDocumentId: "doc-1",
        amount: "18.50",
        currency: "USD",
        itemName: "Lunch",
        description: "Team lunch",
        createdAt: new Date("2026-03-25T10:00:00.000Z"),
        updatedAt: new Date("2026-03-25T10:02:00.000Z"),
      },
      {
        id: "entry-old",
        ledgerId: "ledger-1",
        categoryId: null,
        sourceDocumentId: null,
        amount: "50.00",
        currency: "EUR",
        itemName: "Taxi",
        description: null,
        createdAt: new Date("2026-03-24T10:00:00.000Z"),
        updatedAt: new Date("2026-03-24T10:02:00.000Z"),
      },
      {
        id: "entry-deleted",
        ledgerId: "ledger-1",
        categoryId: "category-1",
        sourceDocumentId: "doc-2",
        amount: "9.99",
        currency: "USD",
        itemName: "Hidden",
        createdAt: new Date("2026-03-26T10:00:00.000Z"),
        updatedAt: new Date("2026-03-26T10:02:00.000Z"),
        deletedAt: new Date("2026-03-26T10:03:00.000Z"),
      },
    ]);

    const result = await listAdminEntries({ limit: 50 });

    expect(result.items.map((item) => item.id)).toEqual(["entry-new", "entry-old"]);
    expect(result.items[0]).toMatchObject({
      userEmail: "owner@example.com",
      categoryName: "Meals",
      sourceDocumentId: "doc-1",
      currency: "USD",
      itemName: "Lunch",
    });
    expect(result.items[1]).toMatchObject({
      userEmail: "owner@example.com",
      categoryName: null,
      sourceDocumentId: null,
      currency: "EUR",
      itemName: "Taxi",
    });
    expect(result.availableCurrencies).toEqual(["EUR", "USD"]);
    expect(result.availableCategories).toEqual([{ id: "category-1", name: "Meals" }]);
    expect(result.hasAnyEntries).toBe(true);
  });

  it("filters by range, currency, category, and source-link state", async () => {
    const db = getTestDb();
    requireSuperAdminMock.mockResolvedValueOnce({
      id: "admin-user",
      email: "admin@example.com",
      name: "Owner",
      role: UserRole.SuperAdmin,
    });

    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-03-25T12:00:00.000Z"));

      await db.insert(users).values({
        id: "user-2",
        email: "filter-owner@example.com",
        emailVerified: new Date(),
        name: "Owner",
        role: UserRole.SuperAdmin,
      });
      await db.insert(ledgers).values({ id: "ledger-2", userId: "user-2", metadata: {} });
      await db.insert(entryCategories).values([
        { id: "category-2", ledgerId: "ledger-2", name: "Meals", sortOrder: 1 },
        { id: "category-3", ledgerId: "ledger-2", name: "Travel", sortOrder: 2 },
      ]);

      await db.insert(ledgerEntries).values([
        {
          id: "match-linked",
          ledgerId: "ledger-2",
          categoryId: "category-2",
          sourceDocumentId: "doc-1",
          amount: "18.50",
          currency: "USD",
          itemName: "Lunch",
          createdAt: new Date("2026-03-25T11:00:00.000Z"),
          updatedAt: new Date("2026-03-25T11:01:00.000Z"),
        },
        {
          id: "match-unlinked",
          ledgerId: "ledger-2",
          categoryId: "category-2",
          sourceDocumentId: null,
          amount: "12.00",
          currency: "USD",
          itemName: "Snack",
          createdAt: new Date("2026-03-25T10:00:00.000Z"),
          updatedAt: new Date("2026-03-25T10:01:00.000Z"),
        },
        {
          id: "wrong-currency",
          ledgerId: "ledger-2",
          categoryId: "category-2",
          sourceDocumentId: "doc-2",
          amount: "30.00",
          currency: "EUR",
          itemName: "Dinner",
          createdAt: new Date("2026-03-25T11:30:00.000Z"),
          updatedAt: new Date("2026-03-25T11:31:00.000Z"),
        },
        {
          id: "wrong-category",
          ledgerId: "ledger-2",
          categoryId: "category-3",
          sourceDocumentId: "doc-3",
          amount: "40.00",
          currency: "USD",
          itemName: "Taxi",
          createdAt: new Date("2026-03-25T11:30:00.000Z"),
          updatedAt: new Date("2026-03-25T11:31:00.000Z"),
        },
        {
          id: "out-of-range",
          ledgerId: "ledger-2",
          categoryId: "category-2",
          sourceDocumentId: "doc-4",
          amount: "10.00",
          currency: "USD",
          itemName: "Old meal",
          createdAt: new Date("2026-03-10T11:30:00.000Z"),
          updatedAt: new Date("2026-03-10T11:31:00.000Z"),
        },
      ]);

      const linked = await listAdminEntries({
        range: "7d",
        currency: "USD",
        categoryId: "category-2",
        sourceLink: "linked",
        limit: 50,
      });

      expect(linked.items.map((item) => item.id)).toEqual(["match-linked"]);

      const unlinked = await listAdminEntries({
        range: "7d",
        currency: "USD",
        categoryId: "category-2",
        sourceLink: "unlinked",
        limit: 50,
      });

      expect(unlinked.items.map((item) => item.id)).toEqual(["match-unlinked"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns nextCursor and supports cursor pagination ordered by createdAt desc then id desc", async () => {
    const db = getTestDb();
    requireSuperAdminMock.mockResolvedValue({
      id: "admin-user",
      email: "admin@example.com",
      name: "Owner",
      role: UserRole.SuperAdmin,
    });

    await db.insert(users).values({
      id: "user-3",
      email: "cursor-owner@example.com",
      emailVerified: new Date(),
      name: "Owner",
      role: UserRole.SuperAdmin,
    });
    await db.insert(ledgers).values({ id: "ledger-3", userId: "user-3", metadata: {} });

    await db.insert(ledgerEntries).values([
      {
        id: "entry-c",
        ledgerId: "ledger-3",
        amount: "9.00",
        currency: "USD",
        itemName: "Newest",
        createdAt: new Date("2026-03-25T12:00:00.000Z"),
        updatedAt: new Date("2026-03-25T12:01:00.000Z"),
      },
      {
        id: "entry-b",
        ledgerId: "ledger-3",
        amount: "8.00",
        currency: "USD",
        itemName: "Middle",
        createdAt: new Date("2026-03-25T11:00:00.000Z"),
        updatedAt: new Date("2026-03-25T11:01:00.000Z"),
      },
      {
        id: "entry-a",
        ledgerId: "ledger-3",
        amount: "7.00",
        currency: "USD",
        itemName: "Oldest",
        createdAt: new Date("2026-03-25T10:00:00.000Z"),
        updatedAt: new Date("2026-03-25T10:01:00.000Z"),
      },
    ]);

    const firstPage = await listAdminEntries({ limit: 2 });

    expect(firstPage.items.map((item) => item.id)).toEqual(["entry-c", "entry-b"]);
    expect(firstPage.nextCursor).toBe("2026-03-25T11:00:00.000Z|entry-b");

    const secondPage = await listAdminEntries({
      limit: 2,
      cursor: firstPage.nextCursor ?? undefined,
    });

    expect(secondPage.items.map((item) => item.id)).toEqual(["entry-a"]);
    expect(secondPage.nextCursor).toBeNull();
  });

  it("keeps filtered-empty and global-empty states distinguishable for page composition", async () => {
    const db = getTestDb();
    requireSuperAdminMock.mockResolvedValue({
      id: "admin-user",
      email: "admin@example.com",
      name: "Owner",
      role: UserRole.SuperAdmin,
    });

    await db.insert(users).values({
      id: "user-4",
      email: "empty-owner@example.com",
      emailVerified: new Date(),
      name: "Owner",
      role: UserRole.SuperAdmin,
    });
    await db.insert(ledgers).values({ id: "ledger-4", userId: "user-4", metadata: {} });
    await db.insert(entryCategories).values({
      id: "category-4",
      ledgerId: "ledger-4",
      name: "Meals",
      sortOrder: 1,
    });
    await db.insert(ledgerEntries).values({
      id: "entry-existing",
      ledgerId: "ledger-4",
      categoryId: "category-4",
      amount: "10.00",
      currency: "USD",
      itemName: "Existing",
      createdAt: new Date("2026-03-25T12:00:00.000Z"),
      updatedAt: new Date("2026-03-25T12:01:00.000Z"),
    });

    const filtered = await listAdminEntries({
      currency: "EUR",
      limit: 50,
    });

    expect(filtered.items).toEqual([]);
    expect(filtered.nextCursor).toBeNull();
    expect(filtered.hasAnyEntries).toBe(true);
    expect(filtered.availableCurrencies).toEqual(["USD"]);
    expect(filtered.availableCategories).toEqual([{ id: "category-4", name: "Meals" }]);

    await db.run(sql`DELETE FROM ledger_entries`);

    const empty = await listAdminEntries({ limit: 50 });

    expect(empty.items).toEqual([]);
    expect(empty.nextCursor).toBeNull();
    expect(empty.hasAnyEntries).toBe(false);
    expect(empty.availableCurrencies).toEqual([]);
    expect(empty.availableCategories).toEqual([]);
  });
});
