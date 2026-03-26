import { describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { getTestDb } from "tests/setup";
import { ledgerEntries, ledgers, sourceDocuments, users } from "@/persistence";
import { listAdminSourceDocuments } from "@/modules/admin/queries";
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

describe("listAdminSourceDocuments", () => {
  it("requires super-admin access before querying source documents", async () => {
    requireSuperAdminMock.mockRejectedValueOnce(new Error("forbidden"));

    await expect(listAdminSourceDocuments({ limit: 50 })).rejects.toThrow("forbidden");
  });

  it("returns newest source documents first, enriches user email, and counts active entries", async () => {
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

    await db.insert(sourceDocuments).values([
      {
        id: "doc-new",
        ledgerId: "ledger-1",
        title: "March lunch receipt",
        text: "Lunch total 18.50",
        status: "completed",
        type: "ai_parsed",
        entryDate: "2026-03-24",
        createdAt: new Date("2026-03-25T10:00:00.000Z"),
        updatedAt: new Date("2026-03-25T10:02:00.000Z"),
      },
      {
        id: "doc-old",
        ledgerId: "ledger-1",
        title: "Taxi note",
        text: "Airport taxi",
        status: "anomaly",
        type: "manual",
        anomalyReason: "missing_total",
        entryDate: "2026-03-20",
        createdAt: new Date("2026-03-24T10:00:00.000Z"),
        updatedAt: new Date("2026-03-24T10:02:00.000Z"),
      },
      {
        id: "doc-deleted",
        ledgerId: "ledger-1",
        title: "Hidden document",
        text: "Deleted",
        status: "deleted",
        type: "ai_parsed",
        createdAt: new Date("2026-03-26T10:00:00.000Z"),
        updatedAt: new Date("2026-03-26T10:02:00.000Z"),
        deletedAt: new Date("2026-03-26T10:03:00.000Z"),
      },
    ]);

    await db.insert(ledgerEntries).values([
      {
        id: "entry-1",
        ledgerId: "ledger-1",
        sourceDocumentId: "doc-new",
        amount: "18.50",
        currency: "USD",
        itemName: "Lunch",
        createdAt: new Date("2026-03-25T10:05:00.000Z"),
      },
      {
        id: "entry-2",
        ledgerId: "ledger-1",
        sourceDocumentId: "doc-new",
        amount: "2.00",
        currency: "USD",
        itemName: "Tip",
        createdAt: new Date("2026-03-25T10:06:00.000Z"),
      },
      {
        id: "entry-deleted",
        ledgerId: "ledger-1",
        sourceDocumentId: "doc-old",
        amount: "40.00",
        currency: "USD",
        itemName: "Taxi",
        createdAt: new Date("2026-03-24T10:05:00.000Z"),
        deletedAt: new Date("2026-03-24T10:06:00.000Z"),
      },
    ]);

    const result = await listAdminSourceDocuments({ limit: 50 });

    expect(result.items.map((item) => item.id)).toEqual(["doc-new", "doc-old"]);
    expect(result.items[0]).toMatchObject({
      userEmail: "owner@example.com",
      entryCount: 2,
      status: "completed",
      type: "ai_parsed",
    });
    expect(result.items[1]).toMatchObject({
      userEmail: "owner@example.com",
      entryCount: 0,
      status: "anomaly",
      type: "manual",
      anomalyReason: "missing_total",
    });
    expect(result.availableTypes).toEqual(["ai_parsed", "manual"]);
    expect(result.hasAnySourceDocuments).toBe(true);
  });

  it("filters by status, type, range, and entry-result state", async () => {
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

      await db.insert(sourceDocuments).values([
        {
          id: "match-with-entries",
          ledgerId: "ledger-2",
          title: "Good receipt",
          status: "completed",
          type: "ai_parsed",
          createdAt: new Date("2026-03-25T11:00:00.000Z"),
          updatedAt: new Date("2026-03-25T11:01:00.000Z"),
        },
        {
          id: "match-without-entries",
          ledgerId: "ledger-2",
          title: "No entry yet",
          status: "completed",
          type: "ai_parsed",
          createdAt: new Date("2026-03-25T10:00:00.000Z"),
          updatedAt: new Date("2026-03-25T10:01:00.000Z"),
        },
        {
          id: "out-of-range",
          ledgerId: "ledger-2",
          title: "Old receipt",
          status: "completed",
          type: "ai_parsed",
          createdAt: new Date("2026-03-10T10:00:00.000Z"),
          updatedAt: new Date("2026-03-10T10:01:00.000Z"),
        },
        {
          id: "wrong-status",
          ledgerId: "ledger-2",
          title: "Processing",
          status: "processing",
          type: "ai_parsed",
          createdAt: new Date("2026-03-25T11:30:00.000Z"),
          updatedAt: new Date("2026-03-25T11:31:00.000Z"),
        },
        {
          id: "wrong-type",
          ledgerId: "ledger-2",
          title: "Manual note",
          status: "completed",
          type: "manual",
          createdAt: new Date("2026-03-25T11:30:00.000Z"),
          updatedAt: new Date("2026-03-25T11:31:00.000Z"),
        },
      ]);

      await db.insert(ledgerEntries).values({
        id: "entry-match",
        ledgerId: "ledger-2",
        sourceDocumentId: "match-with-entries",
        amount: "18.50",
        currency: "USD",
        itemName: "Lunch",
        createdAt: new Date("2026-03-25T11:05:00.000Z"),
      });

      const withEntries = await listAdminSourceDocuments({
        status: "completed",
        type: "ai_parsed",
        range: "7d",
        result: "withEntries",
        limit: 50,
      });

      expect(withEntries.items.map((item) => item.id)).toEqual(["match-with-entries"]);

      const withoutEntries = await listAdminSourceDocuments({
        status: "completed",
        type: "ai_parsed",
        range: "7d",
        result: "withoutEntries",
        limit: 50,
      });

      expect(withoutEntries.items.map((item) => item.id)).toEqual(["match-without-entries"]);
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

    await db.insert(sourceDocuments).values([
      {
        id: "doc-c",
        ledgerId: "ledger-3",
        title: "Newest",
        status: "completed",
        type: "ai_parsed",
        createdAt: new Date("2026-03-25T12:00:00.000Z"),
        updatedAt: new Date("2026-03-25T12:01:00.000Z"),
      },
      {
        id: "doc-b",
        ledgerId: "ledger-3",
        title: "Middle",
        status: "completed",
        type: "ai_parsed",
        createdAt: new Date("2026-03-25T11:00:00.000Z"),
        updatedAt: new Date("2026-03-25T11:01:00.000Z"),
      },
      {
        id: "doc-a",
        ledgerId: "ledger-3",
        title: "Oldest",
        status: "completed",
        type: "ai_parsed",
        createdAt: new Date("2026-03-25T10:00:00.000Z"),
        updatedAt: new Date("2026-03-25T10:01:00.000Z"),
      },
    ]);

    const firstPage = await listAdminSourceDocuments({ limit: 2 });

    expect(firstPage.items.map((item) => item.id)).toEqual(["doc-c", "doc-b"]);
    expect(firstPage.nextCursor).toBe("2026-03-25T11:00:00.000Z|doc-b");

    const secondPage = await listAdminSourceDocuments({
      limit: 2,
      cursor: firstPage.nextCursor ?? undefined,
    });

    expect(secondPage.items.map((item) => item.id)).toEqual(["doc-a"]);
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
    await db.insert(sourceDocuments).values({
      id: "doc-existing",
      ledgerId: "ledger-4",
      title: "Existing",
      status: "completed",
      type: "manual",
      createdAt: new Date("2026-03-25T12:00:00.000Z"),
      updatedAt: new Date("2026-03-25T12:01:00.000Z"),
    });

    const filtered = await listAdminSourceDocuments({
      status: "failed",
      limit: 50,
    });

    expect(filtered.items).toEqual([]);
    expect(filtered.nextCursor).toBeNull();
    expect(filtered.hasAnySourceDocuments).toBe(true);
    expect(filtered.availableTypes).toEqual(["manual"]);

    await db.run(sql`DELETE FROM source_documents`);

    const empty = await listAdminSourceDocuments({ limit: 50 });

    expect(empty.items).toEqual([]);
    expect(empty.nextCursor).toBeNull();
    expect(empty.hasAnySourceDocuments).toBe(false);
    expect(empty.availableTypes).toEqual([]);
  });

  it("never surfaces source documents already marked deleted even when deletedAt was not backfilled", async () => {
    const db = getTestDb();
    requireSuperAdminMock.mockResolvedValue({
      id: "admin-user",
      email: "admin@example.com",
      name: "Owner",
      role: UserRole.SuperAdmin,
    });

    await db.insert(users).values({
      id: "user-5",
      email: "visibility-owner@example.com",
      emailVerified: new Date(),
      name: "Owner",
      role: UserRole.SuperAdmin,
    });
    await db.insert(ledgers).values({ id: "ledger-5", userId: "user-5", metadata: {} });
    await db.insert(sourceDocuments).values([
      {
        id: "doc-visible",
        ledgerId: "ledger-5",
        title: "Visible document",
        status: "completed",
        type: "manual",
        createdAt: new Date("2026-03-26T09:00:00.000Z"),
        updatedAt: new Date("2026-03-26T09:01:00.000Z"),
      },
      {
        id: "doc-deleted-status-only",
        ledgerId: "ledger-5",
        title: "Should stay hidden",
        status: "deleted",
        type: "ai_parsed",
        createdAt: new Date("2026-03-26T10:00:00.000Z"),
        updatedAt: new Date("2026-03-26T10:01:00.000Z"),
        deletedAt: null,
      },
    ]);

    const result = await listAdminSourceDocuments({ limit: 50 });

    expect(result.items.map((item) => item.id)).toEqual(["doc-visible"]);
    expect(result.availableTypes).toEqual(["manual"]);
  });
});
