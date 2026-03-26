import { describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { NotFoundError } from "@/lib/errors";
import { getTestDb } from "tests/setup";
import { ledgerEntries, ledgers, sourceDocuments, users } from "@/persistence";
import { getAdminSourceDocumentDetail } from "@/modules/admin/queries";
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

describe("getAdminSourceDocumentDetail", () => {
  it("returns every source_documents column plus helper fields for a visible document", async () => {
    const db = getTestDb();
    requireSuperAdminMock.mockResolvedValueOnce({
      id: "admin-user",
      email: "admin@example.com",
      name: "Owner",
      role: UserRole.SuperAdmin,
    });

    await db.run(sql`DELETE FROM ledger_entries`);
    await db.run(sql`DELETE FROM source_documents`);
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

    await db.insert(sourceDocuments).values({
      id: "doc-1",
      ledgerId: "ledger-1",
      title: "March lunch receipt",
      text: "Lunch total 18.50",
      imageUrls: ["https://example.com/receipt.png"],
      status: "completed",
      type: "ai_parsed",
      anomalyReason: null,
      entryDate: "2026-03-20",
      metadata: { provider: "openai", model: "gpt-5" },
      createdAt: new Date("2026-03-22T10:00:00.000Z"),
      updatedAt: new Date("2026-03-22T10:02:00.000Z"),
      deletedAt: null,
    });

    await db.insert(ledgerEntries).values([
      {
        id: "entry-1",
        ledgerId: "ledger-1",
        sourceDocumentId: "doc-1",
        amount: "18.50",
        currency: "USD",
        itemName: "Lunch",
        createdAt: new Date("2026-03-22T10:03:00.000Z"),
      },
      {
        id: "entry-2",
        ledgerId: "ledger-1",
        sourceDocumentId: "doc-1",
        amount: "2.00",
        currency: "USD",
        itemName: "Tip",
        createdAt: new Date("2026-03-22T10:04:00.000Z"),
      },
    ]);

    const result = await getAdminSourceDocumentDetail("doc-1");

    expect(result).toMatchObject({
      id: "doc-1",
      ledgerId: "ledger-1",
      userEmail: "owner@example.com",
      title: "March lunch receipt",
      text: "Lunch total 18.50",
      imageUrls: ["https://example.com/receipt.png"],
      status: "completed",
      type: "ai_parsed",
      anomalyReason: null,
      entryDate: "2026-03-20",
      metadata: { provider: "openai", model: "gpt-5" },
      entryCount: 2,
      createdAt: new Date("2026-03-22T10:00:00.000Z"),
      updatedAt: new Date("2026-03-22T10:02:00.000Z"),
      deletedAt: null,
    });
  });

  it("keeps helper fields null-safe when joined rows are absent", async () => {
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
    await db.insert(sourceDocuments).values({
      id: "doc-2",
      ledgerId: "ledger-2",
      title: "No entries yet",
      text: null,
      imageUrls: [],
      status: "queued",
      type: "manual",
      anomalyReason: null,
      entryDate: null,
      metadata: {},
      createdAt: new Date("2026-03-23T10:00:00.000Z"),
      updatedAt: new Date("2026-03-23T10:02:00.000Z"),
      deletedAt: null,
    });

    const result = await getAdminSourceDocumentDetail("doc-2");

    expect(result.userEmail).toBeNull();
    expect(result.entryCount).toBe(0);
  });

  it("requires super-admin access before reading source-document detail", async () => {
    requireSuperAdminMock.mockRejectedValueOnce(new Error("forbidden"));

    await expect(getAdminSourceDocumentDetail("doc-1")).rejects.toThrow("forbidden");
  });

  it("throws NotFoundError for missing or soft-deleted source documents", async () => {
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
    await db.insert(sourceDocuments).values({
      id: "doc-deleted",
      ledgerId: "ledger-3",
      title: "Deleted document",
      text: "Hidden",
      imageUrls: [],
      status: "deleted",
      type: "ai_parsed",
      createdAt: new Date("2026-03-24T10:00:00.000Z"),
      updatedAt: new Date("2026-03-24T10:01:00.000Z"),
      deletedAt: new Date("2026-03-24T10:02:00.000Z"),
    });

    await expect(getAdminSourceDocumentDetail("missing-doc")).rejects.toBeInstanceOf(NotFoundError);
    await expect(getAdminSourceDocumentDetail("doc-deleted")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("throws NotFoundError when a document is already marked deleted even without deletedAt", async () => {
    const db = getTestDb();
    requireSuperAdminMock.mockResolvedValue({
      id: "admin-user",
      email: "admin@example.com",
      name: "Owner",
      role: UserRole.SuperAdmin,
    });

    await db.insert(users).values({
      id: "user-4",
      email: "owner-4@example.com",
      emailVerified: new Date(),
      name: "Owner",
      role: UserRole.SuperAdmin,
    });
    await db.insert(ledgers).values({ id: "ledger-4", userId: "user-4", metadata: {} });
    await db.insert(sourceDocuments).values({
      id: "doc-deleted-status-only",
      ledgerId: "ledger-4",
      title: "Deleted status only",
      text: "Hidden",
      imageUrls: [],
      status: "deleted",
      type: "manual",
      createdAt: new Date("2026-03-25T10:00:00.000Z"),
      updatedAt: new Date("2026-03-25T10:01:00.000Z"),
      deletedAt: null,
    });

    await expect(getAdminSourceDocumentDetail("doc-deleted-status-only")).rejects.toBeInstanceOf(
      NotFoundError
    );
  });
});
