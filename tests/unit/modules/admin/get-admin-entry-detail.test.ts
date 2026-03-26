import { describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { NotFoundError } from "@/lib/errors";
import { getTestDb } from "tests/setup";
import { entryCategories, ledgerEntries, ledgers, sourceDocuments, users } from "@/persistence";
import { getAdminEntryDetail } from "@/modules/admin/queries";
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

describe("getAdminEntryDetail", () => {
  it("returns every ledger_entries column plus approved helper fields", async () => {
    const db = getTestDb();
    requireSuperAdminMock.mockResolvedValueOnce({
      id: "admin-user",
      email: "admin@example.com",
      name: "Owner",
      role: UserRole.SuperAdmin,
    });

    await db.run(sql`DELETE FROM ledger_entries`);
    await db.run(sql`DELETE FROM source_documents`);
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
    await db.insert(sourceDocuments).values({
      id: "doc-1",
      ledgerId: "ledger-1",
      title: "March lunch receipt",
      text: "Lunch total 18.50",
      status: "completed",
      type: "ai_parsed",
      createdAt: new Date("2026-03-22T09:00:00.000Z"),
      updatedAt: new Date("2026-03-22T09:01:00.000Z"),
    });
    await db.insert(ledgerEntries).values({
      id: "entry-1",
      ledgerId: "ledger-1",
      categoryId: "category-1",
      sourceDocumentId: "doc-1",
      amount: "18.50",
      currency: "USD",
      itemName: "Lunch",
      description: "Team lunch",
      convertedAmount: "18.50",
      exchangeRate: "1.00",
      createdAt: new Date("2026-03-22T10:00:00.000Z"),
      updatedAt: new Date("2026-03-22T10:02:00.000Z"),
      deletedAt: null,
    });

    const result = await getAdminEntryDetail("entry-1");

    expect(result).toMatchObject({
      id: "entry-1",
      ledgerId: "ledger-1",
      userEmail: "owner@example.com",
      categoryId: "category-1",
      categoryName: "Meals",
      sourceDocumentId: "doc-1",
      sourceDocumentTitle: "March lunch receipt",
      sourceDocumentStatus: "completed",
      amount: "18.50",
      currency: "USD",
      itemName: "Lunch",
      description: "Team lunch",
      convertedAmount: "18.50",
      exchangeRate: "1.00",
      createdAt: new Date("2026-03-22T10:00:00.000Z"),
      updatedAt: new Date("2026-03-22T10:02:00.000Z"),
      deletedAt: null,
    });
  });

  it("keeps helper fields null-safe and source-document helpers optional", async () => {
    const db = getTestDb();
    requireSuperAdminMock.mockResolvedValueOnce({
      id: "admin-user",
      email: "admin@example.com",
      name: "Owner",
      role: UserRole.SuperAdmin,
    });

    await db.insert(users).values({
      id: "user-2",
      email: "hidden-owner@example.com",
      emailVerified: new Date(),
      name: "Owner",
      role: UserRole.SuperAdmin,
      deletedAt: new Date("2026-03-23T09:00:00.000Z"),
    });
    await db.insert(ledgers).values({ id: "ledger-2", userId: "user-2", metadata: {} });
    await db.insert(ledgerEntries).values({
      id: "entry-2",
      ledgerId: "ledger-2",
      categoryId: null,
      sourceDocumentId: null,
      amount: "12.00",
      currency: null,
      itemName: "Snack",
      description: null,
      convertedAmount: null,
      exchangeRate: null,
      createdAt: new Date("2026-03-23T10:00:00.000Z"),
      updatedAt: new Date("2026-03-23T10:02:00.000Z"),
      deletedAt: null,
    });

    const result = await getAdminEntryDetail("entry-2");

    expect(result.userEmail).toBeNull();
    expect(result.categoryName).toBeNull();
    expect(result.sourceDocumentId).toBeNull();
    expect(result.sourceDocumentTitle ?? null).toBeNull();
    expect(result.sourceDocumentStatus ?? null).toBeNull();
  });

  it("requires super-admin access before reading entry detail", async () => {
    requireSuperAdminMock.mockRejectedValueOnce(new Error("forbidden"));

    await expect(getAdminEntryDetail("entry-1")).rejects.toThrow("forbidden");
  });

  it("throws NotFoundError for missing or soft-deleted entries", async () => {
    const db = getTestDb();
    requireSuperAdminMock.mockResolvedValue({
      id: "admin-user",
      email: "admin@example.com",
      name: "Owner",
      role: UserRole.SuperAdmin,
    });

    await db.insert(users).values({
      id: "user-3",
      email: "owner-3@example.com",
      emailVerified: new Date(),
      name: "Owner",
      role: UserRole.SuperAdmin,
    });
    await db.insert(ledgers).values({ id: "ledger-3", userId: "user-3", metadata: {} });
    await db.insert(ledgerEntries).values({
      id: "entry-deleted",
      ledgerId: "ledger-3",
      amount: "1.00",
      currency: "USD",
      itemName: "Deleted",
      createdAt: new Date("2026-03-24T10:00:00.000Z"),
      updatedAt: new Date("2026-03-24T10:02:00.000Z"),
      deletedAt: new Date("2026-03-24T10:03:00.000Z"),
    });

    await expect(getAdminEntryDetail("missing-entry")).rejects.toBeInstanceOf(NotFoundError);
    await expect(getAdminEntryDetail("entry-deleted")).rejects.toBeInstanceOf(NotFoundError);
  });
});
