import { describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getTestDb } from "../../setup";
import { createTestUserWithLedger } from "../../helpers/schema-setup";
import { objectCleanupJobs, uploadSessionFiles, uploadSessions } from "@/persistence";

const deleteObject = vi.hoisted(() => vi.fn());
vi.mock("@/lib/storage/s3", () => ({
  getS3Storage: () => ({ delete: deleteObject }),
}));

import { runBoundedMaintenance } from "@/application/adapters/postgres/maintenance";

describe("persistent object cleanup maintenance", () => {
  it("keeps database state until object deletion succeeds and retries with backoff", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db);
    const sessionId = crypto.randomUUID();
    const targetId = crypto.randomUUID();
    const old = new Date("2026-01-01T00:00:00.000Z");
    await db.insert(uploadSessions).values({
      id: sessionId,
      ledgerId,
      finalizationTokenHash: "token-hash",
      status: "cancelled",
      expiresAt: old,
      createdAt: old,
    });
    await db.insert(uploadSessionFiles).values({
      ledgerId,
      uploadSessionId: sessionId,
      targetId,
      position: 0,
    });
    deleteObject.mockResolvedValueOnce({ success: false, error: new Error("unavailable") });

    const firstRun = new Date("2026-08-02T00:00:00.000Z");
    await runBoundedMaintenance(firstRun);

    expect(
      await db.query.uploadSessions.findFirst({ where: eq(uploadSessions.id, sessionId) })
    ).toBeDefined();
    const queued = await db.query.objectCleanupJobs.findFirst({
      where: eq(objectCleanupJobs.uploadSessionId, sessionId),
    });
    expect(queued).toMatchObject({ attempts: 1, lastError: "Error" });

    deleteObject.mockResolvedValueOnce({ success: true });
    await runBoundedMaintenance(new Date(firstRun.getTime() + 60 * 60 * 1000));

    expect(
      await db.query.objectCleanupJobs.findFirst({
        where: eq(objectCleanupJobs.uploadSessionId, sessionId),
      })
    ).toBeUndefined();
    expect(
      await db.query.uploadSessions.findFirst({ where: eq(uploadSessions.id, sessionId) })
    ).toBeUndefined();
    expect(deleteObject).toHaveBeenCalledWith(`temporary/${ledgerId}/${sessionId}/${targetId}`);
  });
});
