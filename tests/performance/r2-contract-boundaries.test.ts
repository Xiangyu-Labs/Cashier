import crypto from "node:crypto";
import { beforeEach, afterAll, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { StoredFileAdapter } from "@/application/adapters/local/stored-files";
import { getTestDb } from "tests/setup";
import { createTestUserWithLedger } from "tests/helpers/schema-setup";
import { recordPerformanceFindings } from "tests/helpers/performance-observation";
import {
  revisionFiles,
  sourceDocumentRevisions,
  sourceDocuments,
  storedFiles,
  uploadSessionFiles,
  uploadSessions,
} from "@/persistence";

const { downloadMock } = vi.hoisted(() => ({ downloadMock: vi.fn() }));

vi.mock("@/lib/storage/r2", () => ({
  getR2Storage: () => ({
    upload: vi.fn(),
    download: downloadMock,
    delete: vi.fn(async () => ({ success: true })),
  }),
}));

import { GET } from "@/app/api/stored-files/[fileId]/route";

function request(): NextRequest {
  return new Request("http://localhost/api/stored-files/file") as NextRequest;
}

async function createLinkedStoredFile(ledgerId: string) {
  const db = getTestDb();
  const [document] = await db
    .insert(sourceDocuments)
    .values({ ledgerId, status: "completed", imageUrls: [] })
    .returning();
  const [revision] = await db
    .insert(sourceDocumentRevisions)
    .values({
      ledgerId,
      sourceDocumentId: document!.id,
      revisionNumber: 1,
      outcome: "completed",
      finalizedAt: new Date(),
    })
    .returning();
  const [file] = await db
    .insert(storedFiles)
    .values({
      ledgerId,
      storageProvider: "r2",
      storageKey: `${ledgerId}/private/file`,
      contentType: "image/png",
      byteSize: 5,
      finalizedAt: new Date(),
    })
    .returning();
  await db.insert(revisionFiles).values({
    ledgerId,
    revisionId: revision!.id,
    storedFileId: file!.id,
    position: 0,
  });
  await db
    .update(sourceDocuments)
    .set({ activeRevisionId: revision!.id })
    .where(eq(sourceDocuments.id, document!.id));
  return file!;
}

describe("R2-facing local contract boundaries", () => {
  beforeEach(() => {
    downloadMock.mockReset();
  });

  it("creates an upload session and targets without issuing an object-storage request", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db);
    const storage = { upload: vi.fn(), download: vi.fn(), delete: vi.fn() };
    const adapter = new StoredFileAdapter(storage);

    const plan = await adapter.createUploadPlan(ledgerId, [
      { contentType: "image/png", byteSize: 5, originalFilename: "receipt.png" },
    ]);

    const sessions = await db.select().from(uploadSessions).where(eq(uploadSessions.id, plan.id));
    const targets = await db
      .select()
      .from(uploadSessionFiles)
      .where(eq(uploadSessionFiles.uploadSessionId, plan.id));
    expect(sessions).toHaveLength(1);
    expect(targets).toHaveLength(1);
    expect(plan.targets).toEqual([
      expect.objectContaining({
        method: "PUT",
        url: expect.stringContaining(`/api/stored-files/upload-targets/${plan.id}/`),
        requiredHeaders: { "Content-Type": "image/png" },
      }),
    ]);
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it("authorizes stored-file reads before invoking the mocked R2 download", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(
      db,
      "other@example.com",
      undefined,
      crypto.randomUUID()
    );
    const file = await createLinkedStoredFile(ledgerId);

    const response = await GET(request(), { params: Promise.resolve({ fileId: file.id }) });

    expect(response.status).toBe(404);
    expect(downloadMock).not.toHaveBeenCalled();
  });

  it("returns trusted bytes through the local R2 double without exposing its storage key", async () => {
    const db = getTestDb();
    const { ledgerId } = await createTestUserWithLedger(db);
    const file = await createLinkedStoredFile(ledgerId);
    downloadMock.mockResolvedValue(Buffer.from("bytes"));

    const response = await GET(request(), { params: Promise.resolve({ fileId: file.id }) });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(await response.text()).toBe("bytes");
    expect(downloadMock).toHaveBeenCalledOnce();
    expect(JSON.stringify(Object.fromEntries(response.headers))).not.toContain(file.storageKey);
  });
});

afterAll(async () => {
  await recordPerformanceFindings([
    {
      id: "r2-upload-session-contract",
      category: "r2-contract",
      evidenceClass: "confirmed-structural",
      title: "Upload-plan creation persists scoped targets before object upload",
      summary: "A local upload plan creates one session and one scoped PUT target without calling object storage.",
      location: "tests/performance/r2-contract-boundaries.test.ts",
    },
    {
      id: "r2-stored-file-authorization-contract",
      category: "r2-contract",
      evidenceClass: "confirmed-structural",
      title: "Stored-file route authorizes before object download",
      summary: "A different authenticated user receives 404 and the mocked R2 download is not invoked; an authorized read returns trusted bytes without exposing the storage key.",
      location: "tests/performance/r2-contract-boundaries.test.ts",
    },
    {
      id: "r2-cloud-latency",
      category: "r2-contract",
      evidenceClass: "external-validation-needed",
      title: "R2 geographic transfer latency",
      summary: "These tests use a local storage double and do not measure real bucket latency, bandwidth, or location.",
      location: "tests/performance/r2-contract-boundaries.test.ts",
    },
  ]);
});
