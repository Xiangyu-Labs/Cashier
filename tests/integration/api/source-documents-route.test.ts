import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { POST } from "@/app/api/v1/source-documents/route";
import { GET } from "@/app/api/v1/source-documents/[sourceDocumentId]/route";
import { getTestDb } from "../../setup";
import { createTestUserWithLedger, TEST_USER_ID } from "../../helpers/schema-setup";
import {
  ledgers,
  ledgerEntries,
  processingOutbox,
  revisionFiles,
  serviceCredentials,
  sourceDocumentRevisions,
  sourceDocuments,
  revisionEntries,
  storedFiles,
  uploadSessions,
} from "@/persistence";
import { computeHash, prefixSuffix } from "@/lib/security/service-credential-token";

async function validJpegBase64(): Promise<string> {
  const buffer = await sharp({
    create: { width: 1, height: 1, channels: 3, background: { r: 255, g: 0, b: 0 } },
  })
    .jpeg()
    .toBuffer();
  return buffer.toString("base64");
}

vi.mock("@/lib/processing", () => ({
  createProcessingTask: vi.fn(),
  createTask: vi.fn(),
}));

const { submitMock } = vi.hoisted(() => ({
  submitMock: vi.fn().mockResolvedValue("mock-task-id"),
}));

vi.mock("@/lib/tasks", async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...(original as Record<string, unknown>),
    submitTask: submitMock,
  };
});

vi.mock("@/application/adapters/in-process/parse-source-document-task", () => ({
  TASK_TYPE_PARSE_SOURCE_DOCUMENT: "parse_source_document",
  parseSourceDocumentTaskDefinition: {
    type: "parse_source_document",
    handler: {
      execute: vi.fn(),
    },
  },
}));

// Hoisted shared memory store so the beforeEach and vi.mock factory share the same Map
const mockR2 = vi.hoisted(() => {
  const files = new Map<string, Buffer>();
  return {
    files,
    getStorage: () => ({
      upload: async (key: string, data: Buffer) => {
        files.set(key, Buffer.from(data));
      },
      download: async (key: string) => {
        const data = files.get(key);
        if (data == null) throw new Error("File not found");
        return Buffer.from(data);
      },
      delete: async (key: string) => {
        files.delete(key);
        return { success: true };
      },
    }),
    R2StorageProvider: class {
      async upload(key: string, data: Buffer) {
        files.set(key, Buffer.from(data));
      }
      async download(key: string) {
        const data = files.get(key);
        if (data == null) throw new Error("File not found");
        return Buffer.from(data);
      }
      async delete(key: string) {
        files.delete(key);
        return { success: true };
      }
    },
  };
});

vi.mock("@/lib/storage/s3", () => ({
  S3StorageProvider: mockR2.R2StorageProvider,
  getS3Storage: mockR2.getStorage,
}));

describe("API v1 source-documents route", () => {
  let ledgerId: string;
  let credentialKey: string;

  beforeEach(async () => {
    const db = getTestDb();
    mockR2.files.clear();

    await db.delete(ledgers).where(eq(ledgers.userId, TEST_USER_ID));
    const setup = await createTestUserWithLedger(db, undefined, "Route Test Ledger", TEST_USER_ID);
    ledgerId = setup.ledgerId;

    credentialKey = `sk_route_${crypto.randomUUID().replace(/-/g, "")}`;
    const { prefix, suffix } = prefixSuffix(credentialKey);
    await db
      .insert(serviceCredentials)
      .values({
        ledgerId,
        name: "Route Credential",
        tokenHash: computeHash(credentialKey),
        tokenPrefix: prefix,
        tokenSuffix: suffix,
      })
      .returning();
  });

  it("GET returns processing status with retry and private no-store headers", async () => {
    const image = await validJpegBase64();
    const created = await POST(
      new NextRequest("http://localhost/api/v1/source-documents", {
        method: "POST",
        headers: { Authorization: `Bearer ${credentialKey}` },
        body: JSON.stringify({ images: [{ data: image, mimeType: "image/jpeg" }] }),
      })
    ).then((response) => response.json());
    const response = await GET(
      new NextRequest(`http://localhost/api/v1/source-documents/${created.sourceDocumentId}`, {
        headers: { Authorization: `Bearer ${credentialKey}` },
      }),
      { params: Promise.resolve({ sourceDocumentId: created.sourceDocumentId }) }
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("retry-after")).toBe("5");
    expect(await response.json()).toMatchObject({
      sourceDocumentId: created.sourceDocumentId,
      revisionId: created.revisionId,
      status: "processing",
      result: null,
      error: null,
    });
  });

  it("GET returns only the stable completed result projection and hides unknown IDs", async () => {
    const image = await validJpegBase64();
    const created = await POST(
      new NextRequest("http://localhost/api/v1/source-documents", {
        method: "POST",
        headers: { Authorization: `Bearer ${credentialKey}` },
        body: JSON.stringify({ images: [{ data: image, mimeType: "image/jpeg" }] }),
      })
    ).then((response) => response.json());
    const db = getTestDb();
    const [entry] = await db
      .insert(ledgerEntries)
      .values({
        ledgerId,
        sourceDocumentId: created.sourceDocumentId,
        sourceDocumentRevisionId: created.revisionId,
        itemName: "Lunch",
        description: "Noodles",
        amount: "12.50",
        currency: "CNY",
      })
      .returning();
    await db.insert(revisionEntries).values({
      ledgerId,
      revisionId: created.revisionId,
      ledgerEntryId: entry!.id,
      position: 0,
    });
    await db
      .update(sourceDocumentRevisions)
      .set({ outcome: "completed", finalizedAt: new Date() })
      .where(eq(sourceDocumentRevisions.id, created.revisionId));
    await db
      .update(sourceDocuments)
      .set({
        status: "completed",
        title: "Lunch receipt",
        activeRevisionId: created.revisionId,
        pendingRevisionId: null,
      })
      .where(eq(sourceDocuments.id, created.sourceDocumentId));

    const response = await GET(
      new NextRequest(`http://localhost/api/v1/source-documents/${created.sourceDocumentId}`, {
        headers: { Authorization: `Bearer ${credentialKey}` },
      }),
      { params: Promise.resolve({ sourceDocumentId: created.sourceDocumentId }) }
    );
    const body = await response.json();
    expect(body.result).toEqual({
      title: "Lunch receipt",
      total: "12.50",
      entries: [
        {
          name: "Lunch",
          description: "Noodles",
          amount: "12.50",
          currency: "CNY",
          category: null,
        },
      ],
    });
    expect(JSON.stringify(body)).not.toMatch(/fileId|metadata|outbox|stack|storageKey/);

    const unknownId = crypto.randomUUID();
    const missing = await GET(
      new NextRequest(`http://localhost/api/v1/source-documents/${unknownId}`, {
        headers: { Authorization: `Bearer ${credentialKey}` },
      }),
      { params: Promise.resolve({ sourceDocumentId: unknownId }) }
    );
    expect(missing.status).toBe(404);
    expect(missing.headers.get("cache-control")).toBe("private, no-store");
  });

  it("POST /api/v1/source-documents returns 201 for valid credential request", async () => {
    const image = await validJpegBase64();
    const request = new NextRequest("http://localhost/api/v1/source-documents", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${credentialKey}`,
      },
      body: JSON.stringify({ images: [{ data: image, mimeType: "image/jpeg" }] }),
    });

    const response = await POST(request);
    expect(response.status).toBe(201);

    const data = await response.json();
    expect(data.status).toBe("processing");
    expect(data.revisionState).toBe("processing");
    expect(data.sourceDocumentId).toEqual(expect.any(String));
    expect(data.revisionId).toEqual(expect.any(String));

    const db = getTestDb();
    const created = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, data.sourceDocumentId),
    });
    expect(created?.ledgerId).toBe(ledgerId);
  });

  it("creates one document, revision, and processing intent for concurrent idempotent requests", async () => {
    const image = await validJpegBase64();
    const makeRequest = () =>
      new NextRequest("http://localhost/api/v1/source-documents", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${credentialKey}`,
          "Idempotency-Key": "same-ingestion-request",
        },
        body: JSON.stringify({ images: [{ data: image, mimeType: "image/jpeg" }] }),
      });

    const [first, second] = await Promise.all([POST(makeRequest()), POST(makeRequest())]);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    const [firstBody, secondBody] = await Promise.all([first.json(), second.json()]);
    expect(secondBody).toEqual(firstBody);

    const db = getTestDb();
    const documents = await db
      .select({ id: sourceDocuments.id })
      .from(sourceDocuments)
      .where(eq(sourceDocuments.ledgerId, ledgerId));
    const revisions = await db
      .select({ id: sourceDocumentRevisions.id })
      .from(sourceDocumentRevisions)
      .where(eq(sourceDocumentRevisions.sourceDocumentId, firstBody.sourceDocumentId));
    const intents = await db
      .select({ id: processingOutbox.id })
      .from(processingOutbox)
      .where(eq(processingOutbox.revisionId, firstBody.revisionId));
    expect(documents).toHaveLength(1);
    expect(revisions).toHaveLength(1);
    expect(intents).toHaveLength(1);
  });

  it("normalizes equivalent Base64 for idempotency and rejects different image content", async () => {
    const image = await validJpegBase64();
    const key = "content-aware-request";
    const submit = (data: string) =>
      POST(
        new NextRequest("http://localhost/api/v1/source-documents", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${credentialKey}`,
            "Idempotency-Key": key,
          },
          body: JSON.stringify({ images: [{ data, mimeType: "image/jpeg" }] }),
        })
      );
    const first = await submit(image);
    const equivalent = `data:image/jpeg;base64,${image.replace(/=/g, "").replace(/(.{40})/g, "$1\n")}`;
    const second = await submit(equivalent);
    expect(second.status).toBe(201);
    expect(await second.json()).toEqual(await first.json());

    const different = (
      await sharp({
        create: { width: 2, height: 1, channels: 3, background: { r: 0, g: 0, b: 255 } },
      })
        .jpeg()
        .toBuffer()
    ).toString("base64");
    const conflict = await submit(different);
    expect(conflict.status).toBe(409);
  });

  describe("inline image ingestion", () => {
    it("returns 201 with a valid inline base64 image and creates a finalized stored file", async () => {
      const fakeJpegBase64 = await validJpegBase64();
      const request = new NextRequest("http://localhost/api/v1/source-documents", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${credentialKey}`,
        },
        body: JSON.stringify({
          images: [{ data: fakeJpegBase64, mimeType: "image/jpeg" }],
        }),
      });

      const response = await POST(request);
      expect(response.status).toBe(201);

      const data = await response.json();
      expect(data.revisionState).toBe("processing");

      // Verify the revision has a linked stored file
      const db = getTestDb();
      const revisionFilesRows = await db
        .select({
          storedFileId: revisionFiles.storedFileId,
          position: revisionFiles.position,
        })
        .from(revisionFiles)
        .innerJoin(
          sourceDocumentRevisions,
          eq(sourceDocumentRevisions.id, revisionFiles.revisionId)
        )
        .where(eq(sourceDocumentRevisions.sourceDocumentId, data.sourceDocumentId));
      expect(revisionFilesRows).toHaveLength(1);
      expect(revisionFilesRows[0]!.position).toBe(0);

      // Verify the stored file is finalized with provider r2
      const storedFile = await db
        .select()
        .from(storedFiles)
        .where(eq(storedFiles.id, revisionFilesRows[0]!.storedFileId))
        .then((rows) => rows[0]);
      expect(storedFile).not.toBeUndefined();
      expect(storedFile!.storageProvider).toBe("s3");
      expect(storedFile!.finalizedAt).not.toBeNull();

      // Verify one processing outbox record exists
      const intents = await db
        .select({ id: processingOutbox.id })
        .from(processingOutbox)
        .where(eq(processingOutbox.revisionId, data.revisionId));
      expect(intents).toHaveLength(1);
    });

    it("returns 201 with a valid data URL image", async () => {
      const pngBase64 = (
        await sharp({
          create: { width: 1, height: 1, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
        })
          .png()
          .toBuffer()
      ).toString("base64");
      const request = new NextRequest("http://localhost/api/v1/source-documents", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${credentialKey}`,
        },
        body: JSON.stringify({
          images: [{ data: `data:image/png;base64,${pngBase64}`, mimeType: "image/png" }],
        }),
      });

      const response = await POST(request);
      expect(response.status).toBe(201);

      const data = await response.json();
      expect(data.revisionState).toBe("processing");

      const db = getTestDb();
      const revisionFilesRows = await db
        .select()
        .from(revisionFiles)
        .innerJoin(
          sourceDocumentRevisions,
          eq(sourceDocumentRevisions.id, revisionFiles.revisionId)
        )
        .where(eq(sourceDocumentRevisions.sourceDocumentId, data.sourceDocumentId));
      // Should have at least one file linked
      expect(revisionFilesRows.length).toBeGreaterThanOrEqual(1);
    });

    it("rejects invalid base64 with 400", async () => {
      const request = new NextRequest("http://localhost/api/v1/source-documents", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${credentialKey}`,
        },
        body: JSON.stringify({
          images: [{ data: "!!!invalid-base64!!!", mimeType: "image/jpeg" }],
        }),
      });

      const response = await POST(request);
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error.details.issues).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: ["images", 0, "data"] })])
      );
    });

    it("normalizes an RFC3339 entryDate without changing image ingestion", async () => {
      const image = await validJpegBase64();
      const request = new NextRequest("http://localhost/api/v1/source-documents", {
        method: "POST",
        headers: { Authorization: `Bearer ${credentialKey}` },
        body: JSON.stringify({
          images: [{ data: image, mimeType: "image/jpeg" }],
          entryDate: "2026-07-27T23:30:00+08:00",
        }),
      });

      const response = await POST(request);
      expect(response.status).toBe(201);
      const body = await response.json();
      const document = await getTestDb().query.sourceDocuments.findFirst({
        where: eq(sourceDocuments.id, body.sourceDocumentId),
      });
      expect(document?.entryDate).toBe("2026-07-27");
    });

    it("reports an invalid entryDate separately from valid image data", async () => {
      const image = await validJpegBase64();
      const request = new NextRequest("http://localhost/api/v1/source-documents", {
        method: "POST",
        headers: { Authorization: `Bearer ${credentialKey}` },
        body: JSON.stringify({
          images: [{ data: image, mimeType: "image/jpeg" }],
          entryDate: "27/07/2026",
        }),
      });

      const response = await POST(request);
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error.details.issues).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: ["entryDate"] })])
      );
    });

    it("rejects data URL MIME mismatch with 400", async () => {
      const request = new NextRequest("http://localhost/api/v1/source-documents", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${credentialKey}`,
        },
        body: JSON.stringify({
          images: [{ data: "data:image/png;base64,iVBORw0KGgo=", mimeType: "image/jpeg" }],
        }),
      });

      const response = await POST(request);
      expect(response.status).toBe(400);
    });

    it("rejects unsupported MIME type with 400", async () => {
      const request = new NextRequest("http://localhost/api/v1/source-documents", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${credentialKey}`,
        },
        body: JSON.stringify({
          images: [{ data: "dGVzdA==", mimeType: "image/tiff" }],
        }),
      });

      const response = await POST(request);
      expect(response.status).toBe(400);
    });

    it("returns identical 201 responses for concurrent idempotent requests with inline images", async () => {
      const fakeJpegBase64 = await validJpegBase64();
      const makeRequest = () =>
        new NextRequest("http://localhost/api/v1/source-documents", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${credentialKey}`,
            "Idempotency-Key": "same-image-ingestion-request",
          },
          body: JSON.stringify({
            images: [{ data: fakeJpegBase64, mimeType: "image/jpeg" }],
          }),
        });

      const [first, second] = await Promise.all([POST(makeRequest()), POST(makeRequest())]);
      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      const [firstBody, secondBody] = await Promise.all([first.json(), second.json()]);
      expect(secondBody).toEqual(firstBody);

      const db = getTestDb();
      const documents = await db
        .select({ id: sourceDocuments.id })
        .from(sourceDocuments)
        .where(eq(sourceDocuments.ledgerId, ledgerId));
      const revisions = await db
        .select({ id: sourceDocumentRevisions.id })
        .from(sourceDocumentRevisions)
        .where(eq(sourceDocumentRevisions.sourceDocumentId, firstBody.sourceDocumentId));
      const storedFilesRows = await db
        .select({ id: storedFiles.id })
        .from(storedFiles)
        .where(eq(storedFiles.ledgerId, ledgerId));
      const revisionFilesRows = await db
        .select({ id: revisionFiles.id })
        .from(revisionFiles)
        .innerJoin(
          sourceDocumentRevisions,
          eq(sourceDocumentRevisions.id, revisionFiles.revisionId)
        )
        .where(eq(sourceDocumentRevisions.sourceDocumentId, firstBody.sourceDocumentId));
      const sessions = await db
        .select({ id: uploadSessions.id })
        .from(uploadSessions)
        .where(eq(uploadSessions.ledgerId, ledgerId));
      const intents = await db
        .select({ id: processingOutbox.id })
        .from(processingOutbox)
        .where(eq(processingOutbox.revisionId, firstBody.revisionId));
      expect(documents).toHaveLength(1);
      expect(revisions).toHaveLength(1);
      expect(storedFilesRows).toHaveLength(1);
      expect(revisionFilesRows).toHaveLength(1);
      expect(sessions).toHaveLength(1);
      expect(intents).toHaveLength(1);
    });
  });
});
