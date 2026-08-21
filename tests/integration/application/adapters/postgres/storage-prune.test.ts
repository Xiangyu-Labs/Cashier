import { describe, expect, it } from "vitest";
import pg from "pg";
import { eq } from "drizzle-orm";
import {
  executeStoragePrune,
  type PruneStorage,
} from "@/application/adapters/postgres/storage-prune";
import { createTestUserWithLedger } from "tests/helpers/schema-setup";
import { getTestDb } from "tests/setup";
import { rateLimitBuckets, storedFiles, uploadSessionFiles, uploadSessions } from "@/persistence";
import type { S3ListedObject, S3ListObjectsPage, S3ObjectMetadata } from "@/lib/storage/s3";

class FakeStorage implements PruneStorage {
  objects = new Map<string, { byteSize: number; lastModified: Date }>();
  failedDeletes = new Set<string>();

  add(key: string, byteSize = 100, lastModified = new Date(Date.now() - 30 * 24 * 3600_000)) {
    this.objects.set(key, { byteSize, lastModified });
  }

  async listObjectsPage(
    prefix: string,
    continuationToken?: string | null,
    maxKeys?: number
  ): Promise<S3ListObjectsPage> {
    const all = [...this.objects.entries()]
      .filter(([key]) => key.startsWith(prefix))
      .map(([key, value]): S3ListedObject => ({
        key,
        byteSize: value.byteSize,
        lastModified: value.lastModified,
      }));
    const start = continuationToken == null ? 0 : Number(continuationToken);
    const page = all.slice(start, start + (maxKeys ?? all.length));
    return {
      objects: page,
      isTruncated: start + page.length < all.length,
      nextContinuationToken: start + page.length < all.length ? String(start + page.length) : null,
    };
  }

  async head(key: string): Promise<S3ObjectMetadata> {
    const object = this.objects.get(key);
    if (object == null) {
      const error = new Error("missing") as Error & { code: string };
      error.code = "FILE_NOT_FOUND";
      throw error;
    }
    return { byteSize: object.byteSize, contentType: "application/octet-stream", metadata: {} };
  }

  async delete(key: string): Promise<{ success: boolean; key: string; error?: Error }> {
    if (this.failedDeletes.has(key)) {
      return { success: false, key, error: new Error("planned deletion failure") };
    }
    if (!this.objects.delete(key)) {
      return { success: true, key };
    }
    return { success: true, key };
  }
}

const durableKey = (ledgerId: string, fileId: string) => `${ledgerId}/stored/${fileId}`;
const temporaryKey = (ledgerId: string, sessionId: string, targetId: string) =>
  `temporary/${ledgerId}/${sessionId}/${targetId}`;

describe("storage prune", () => {
  it("dry-run scans without deleting anything", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db, "prune-dry-run");
    const storage = new FakeStorage();
    const fileId = crypto.randomUUID();
    const key = durableKey(ledgerId, fileId);
    storage.add(key);
    await db.insert(storedFiles).values({
      id: fileId,
      ledgerId,
      storageProvider: "s3",
      storageKey: key,
      contentType: "image/jpeg",
      byteSize: 100,
      createdAt: new Date(Date.now() - 30 * 24 * 3600_000),
    });
    await db.insert(rateLimitBuckets).values({
      bucketKey: "dry-run-bucket",
      count: 3,
      windowStart: new Date(Date.now() - 3 * 24 * 3600_000),
      createdAt: new Date(Date.now() - 3 * 24 * 3600_000),
    });

    const summary = await executeStoragePrune({ storage, now: new Date() });

    expect(summary.mode).toBe("dry-run");
    expect(summary.expiredRecords.rateLimitBuckets).toBeGreaterThanOrEqual(1);
    expect(summary.unreferencedFiles.count).toBe(1);
    expect(summary.unreferencedFiles.deleted).toBe(0);
    expect(storage.objects.has(key)).toBe(true);
    const row = await db.query.storedFiles.findFirst({
      where: (files, { eq }) => eq(files.id, fileId),
    });
    expect(row).not.toBeNull();
    const bucket = await db.query.rateLimitBuckets.findFirst({
      where: (buckets, { eq }) => eq(buckets.bucketKey, "dry-run-bucket"),
    });
    expect(bucket).not.toBeNull();
  });

  it("apply durably claims unreferenced files before deleting R2 objects", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db, "prune-apply");
    const storage = new FakeStorage();
    const fileId = crypto.randomUUID();
    const key = durableKey(ledgerId, fileId);
    storage.add(key);
    await db.insert(storedFiles).values({
      id: fileId,
      ledgerId,
      storageProvider: "s3",
      storageKey: key,
      contentType: "image/jpeg",
      byteSize: 100,
      createdAt: new Date(Date.now() - 30 * 24 * 3600_000),
    });
    await db.insert(rateLimitBuckets).values({
      bucketKey: "apply-bucket",
      count: 3,
      windowStart: new Date(Date.now() - 3 * 24 * 3600_000),
      createdAt: new Date(Date.now() - 3 * 24 * 3600_000),
    });

    const summary = await executeStoragePrune({ storage, now: new Date(), apply: true });

    expect(summary.unreferencedFiles.deleted).toBe(1);
    expect(summary.expiredRecords.rateLimitBuckets).toBeGreaterThanOrEqual(1);
    expect(storage.objects.has(key)).toBe(false);
    const row = await db.query.storedFiles.findFirst({
      where: (files, { eq }) => eq(files.id, fileId),
    });
    expect(row).toBeUndefined();
    const bucket = await db.query.rateLimitBuckets.findFirst({
      where: (buckets, { eq }) => eq(buckets.bucketKey, "apply-bucket"),
    });
    expect(bucket).toBeUndefined();
  });

  it("reports rows whose R2 object is missing and never deletes them", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db, "prune-missing");
    const storage = new FakeStorage();

    const missingId = crypto.randomUUID();
    const missingKey = durableKey(ledgerId, missingId);
    await db.insert(storedFiles).values({
      id: missingId,
      ledgerId,
      storageProvider: "s3",
      storageKey: missingKey,
      contentType: "image/jpeg",
      byteSize: 50,
      createdAt: new Date(Date.now() - 30 * 24 * 3600_000),
    });

    const summary = await executeStoragePrune({ storage, now: new Date(), apply: true });

    expect(summary.unreferencedFiles.missing).toBe(1);
    expect(summary.missingObjects.count).toBe(1);
    const missingRow = await db.query.storedFiles.findFirst({
      where: (files, { eq }) => eq(files.id, missingId),
    });
    expect(missingRow).not.toBeNull();
  });

  it("keeps a durable cleanup job when external deletion fails", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db, "prune-retry");
    const storage = new FakeStorage();
    const fileId = crypto.randomUUID();
    const key = durableKey(ledgerId, fileId);
    storage.add(key);
    storage.failedDeletes.add(key);
    await db.insert(storedFiles).values({
      id: fileId,
      ledgerId,
      storageProvider: "s3",
      storageKey: key,
      contentType: "image/jpeg",
      byteSize: 100,
      createdAt: new Date(Date.now() - 30 * 24 * 3600_000),
    });

    const summary = await executeStoragePrune({ storage, now: new Date(), apply: true });

    expect(summary.unreferencedFiles.failed).toBe(1);
    expect(
      await db.query.storedFiles.findFirst({ where: (files, { eq }) => eq(files.id, fileId) })
    ).toBeUndefined();
    const job = await db.query.objectCleanupJobs.findFirst({
      where: (jobs, { eq }) => eq(jobs.storageKey, key),
    });
    expect(job).toMatchObject({ attempts: 1, lastError: "planned deletion failure" });

    storage.failedDeletes.delete(key);
    const retry = await executeStoragePrune({ storage, now: new Date(), apply: true });
    expect(retry.durableOrphans.deleted).toBe(1);
    expect(
      await db.query.objectCleanupJobs.findFirst({
        where: (jobs, { eq }) => eq(jobs.storageKey, key),
      })
    ).toBeUndefined();
  });

  it("removes durable and temporary orphans older than the grace period", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db, "prune-orphans");
    const storage = new FakeStorage();
    const orphanKey = durableKey(ledgerId, crypto.randomUUID());
    storage.add(orphanKey);

    const sessionId = crypto.randomUUID();
    const targetId = crypto.randomUUID();
    const tempKey = temporaryKey(ledgerId, sessionId, targetId);
    storage.add(tempKey);
    // A valid open session protects its temporary object.
    await db.insert(uploadSessions).values({
      id: sessionId,
      ledgerId,
      finalizationTokenHash: "hash",
      transport: "proxy",
      status: "open",
      expiresAt: new Date(Date.now() + 3600_000),
    });
    await db.insert(uploadSessionFiles).values({
      ledgerId,
      uploadSessionId: sessionId,
      targetId,
      position: 0,
      status: "planned",
    });

    const summary = await executeStoragePrune({ storage, now: new Date(), apply: true });

    expect(summary.durableOrphans.deleted).toBe(1);
    expect(summary.temporaryOrphans.count).toBe(0);
    expect(storage.objects.has(orphanKey)).toBe(false);
    expect(storage.objects.has(tempKey)).toBe(true);

    // Expire the session: the temporary object becomes an orphan.
    await db
      .update(uploadSessions)
      .set({ status: "expired" })
      .where(eq(uploadSessions.id, sessionId));
    const second = await executeStoragePrune({ storage, now: new Date(), apply: true });
    expect(second.temporaryOrphans.deleted).toBe(1);
    expect(storage.objects.has(tempKey)).toBe(false);
  });

  it("fails fast when another prune holds the advisory lock", async () => {
    const db = getTestDb();
    await createTestUserWithLedger(db, "prune-lock");
    const storage = new FakeStorage();
    const client = new pg.Client({
      connectionString:
        process.env.TEST_DATABASE_URL ??
        "postgresql://cashier:cashier@127.0.0.1:55432/cashier_test",
    });
    await client.connect();
    await client.query("SELECT pg_advisory_lock(1381247120)");
    try {
      await expect(executeStoragePrune({ storage })).rejects.toThrow(/advisory lock/);
    } finally {
      await client.query("SELECT pg_advisory_unlock(1381247120)");
      await client.end();
    }
  });
});
