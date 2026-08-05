import { describe, expect, it } from "vitest";
import {
  migrateLedgerStartupSnapshot,
  mergeLedgerStartupDeltaItems,
} from "@/modules/workspace/ledger-startup-cache-store";
import type { SourceDocumentListItemDto } from "@/modules/source-document/contracts";

function document(id: string, entryDate: string): SourceDocumentListItemDto {
  return {
    id,
    ledgerId: "ledger",
    type: "manual",
    status: "completed",
    title: id,
    text: null,
    anomalyReason: null,
    entryDate,
    metadata: {},
    createdAt: `${entryDate}T00:00:00.000Z`,
    updatedAt: `${entryDate}T00:00:00.000Z`,
    deletedAt: null,
    files: [],
    hasImages: false,
    supportedActions: [],
    errorCode: null,
    pendingRevisionId: null,
    ledgerEntries: [],
  };
}

describe("startup snapshot migration", () => {
  it("invalidates an old snapshot for a full rebuild", () => {
    const migrated = migrateLedgerStartupSnapshot({
      key: "user:ledger",
      schemaVersion: 2,
      userId: "user",
      ledgerId: "ledger",
      items: [],
      lastSyncedAt: "2026-07-30T00:00:00.000Z",
      fullSyncAt: null,
    });
    expect(migrated).toMatchObject({
      schemaVersion: 5,
      syncVersion: "0",
      recordCount: 0,
      complete: false,
      truncated: false,
      coverageLimit: 1000,
    });
    expect(migrated).not.toHaveProperty("collapseEntriesDefault");
    expect(migrated.ledgerSettings?.collapseEntriesDefault ?? false).toBe(false);
  });

  it("preserves a complete v4 snapshot while upgrading metadata to v5", () => {
    const item = document("preserved", "2026-08-01");
    const migrated = migrateLedgerStartupSnapshot({
      key: "user:ledger",
      schemaVersion: 4,
      userId: "user",
      ledgerId: "ledger",
      items: [item],
      syncVersion: "9",
      recordCount: 1,
      complete: true,
      truncated: false,
      coverageLimit: 1000,
      lastSyncedAt: "2026-08-01T00:00:00.000Z",
      fullSyncAt: "2026-08-01T00:00:00.000Z",
    });
    expect(migrated.schemaVersion).toBe(5);
    expect(migrated.items).toEqual([item]);
    expect(migrated.syncVersion).toBe("9");
  });

  it("invalidates v3 preferences with the old snapshot", () => {
    const snapshot = {
      key: "user:ledger",
      schemaVersion: 3 as const,
      userId: "user",
      ledgerId: "ledger",
      ledgerSettings: { timeZone: null, collapseEntriesDefault: true },
      items: [],
      syncVersion: "3",
      recordCount: 0,
      complete: true,
      truncated: false,
      coverageLimit: 1000,
      lastSyncedAt: "2026-07-30T00:00:00.000Z",
      fullSyncAt: null,
    };
    expect(
      migrateLedgerStartupSnapshot(snapshot).ledgerSettings?.collapseEntriesDefault ?? false
    ).toBe(false);
  });

  it("drops legacy viewedItems copies from the snapshot", () => {
    const migrated = migrateLedgerStartupSnapshot({
      key: "user:ledger",
      schemaVersion: 5,
      userId: "user",
      ledgerId: "ledger",
      items: [document("a", "2026-08-01")],
      viewedItems: [document("viewed", "2026-08-02")],
      syncVersion: "1",
      recordCount: 1,
      complete: true,
      truncated: false,
      coverageLimit: 1000,
      lastSyncedAt: "2026-08-01T00:00:00.000Z",
      fullSyncAt: "2026-08-01T00:00:00.000Z",
    });
    expect(migrated).not.toHaveProperty("viewedItems");
  });
});

describe("startup delta merge", () => {
  it("applies canonical replacements and tombstones in server order", () => {
    const replacement = { ...document("b", "2026-08-03"), title: "updated" };
    const merged = mergeLedgerStartupDeltaItems(
      [document("a", "2026-08-01"), document("b", "2026-08-02")],
      { documents: [replacement, document("c", "2026-08-04")], tombstones: ["a"] },
      1000
    );
    expect(merged.map((item) => item.id)).toEqual(["c", "b"]);
    expect(merged[1]?.title).toBe("updated");
  });

  it("truncates incremental results to snapshot coverage", () => {
    const merged = mergeLedgerStartupDeltaItems(
      [document("a", "2026-08-01"), document("b", "2026-08-02")],
      { documents: [document("c", "2026-08-03")], tombstones: [] },
      2
    );
    expect(merged.map((item) => item.id)).toEqual(["c", "b"]);
  });
});
