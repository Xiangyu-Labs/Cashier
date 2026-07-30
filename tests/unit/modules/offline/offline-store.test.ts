import { describe, expect, it } from "vitest";
import {
  OFFLINE_IMAGE_BYTES_LIMIT,
  type OfflineImageRecord,
  selectOfflineImageEvictions,
  migrateOfflineSnapshot,
} from "@/modules/offline/offline-store";

function image(overrides: Partial<OfflineImageRecord> & Pick<OfflineImageRecord, "key">) {
  return {
    snapshotKey: "user:ledger",
    fileId: overrides.key,
    documentId: "document",
    contentType: "image/webp",
    byteSize: 1024,
    blob: new Blob(["x"]),
    viewed: false,
    priorityAt: 1,
    lastAccessedAt: 1,
    ...overrides,
  } satisfies OfflineImageRecord;
}

describe("offline image eviction", () => {
  it("evicts unviewed images before older viewed images", () => {
    const records = [
      image({ key: "viewed", viewed: true, lastAccessedAt: 1 }),
      image({ key: "unviewed-new", priorityAt: 3 }),
      image({ key: "unviewed-old", priorityAt: 2 }),
    ];
    records.forEach((record) => (record.byteSize = OFFLINE_IMAGE_BYTES_LIMIT / 3));

    expect(
      selectOfflineImageEvictions(records, OFFLINE_IMAGE_BYTES_LIMIT / 3).map((x) => x.key)
    ).toEqual(["unviewed-old"]);
  });

  it("uses least-recently-viewed order after automatic images are gone", () => {
    const records = [
      image({ key: "viewed-new", viewed: true, lastAccessedAt: 20, byteSize: 6_000_000 }),
      image({ key: "viewed-old", viewed: true, lastAccessedAt: 10, byteSize: 4_000_000 }),
    ];

    expect(selectOfflineImageEvictions(records, 2_000_000).map((x) => x.key)).toEqual([
      "viewed-old",
    ]);
  });

  it("does not count a replaced record twice", () => {
    const records = [image({ key: "same", byteSize: OFFLINE_IMAGE_BYTES_LIMIT })];
    expect(selectOfflineImageEvictions(records, 1024, "same")).toEqual([]);
  });

  it("does not evict a newer automatic image for an older incoming image", () => {
    const records = [image({ key: "newer", priorityAt: 20, byteSize: OFFLINE_IMAGE_BYTES_LIMIT })];
    expect(
      selectOfflineImageEvictions(records, 1024, undefined, { viewed: false, priorityAt: 10 })
    ).toEqual([]);
  });
});

describe("offline snapshot migration", () => {
  it("migrates a v2 snapshot without restoring removed preferences", () => {
    const migrated = migrateOfflineSnapshot({
      key: "user:ledger",
      schemaVersion: 2,
      userId: "user",
      ledgerId: "ledger",
      items: [],
      lastSyncedAt: "2026-07-30T00:00:00.000Z",
      fullSyncAt: null,
    });
    expect(migrated).toMatchObject({
      schemaVersion: 3,
      syncVersion: "legacy:2026-07-30T00:00:00.000Z",
      recordCount: 0,
      complete: true,
      truncated: false,
      coverageLimit: 1000,
    });
    expect(migrated).not.toHaveProperty("collapseEntriesDefault");
    expect(migrated.ledgerSettings?.collapseEntriesDefault ?? false).toBe(false);
  });

  it("preserves the optional collapse preference in v3 snapshots", () => {
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
    expect(migrateOfflineSnapshot(snapshot).ledgerSettings?.collapseEntriesDefault).toBe(true);
  });
});
