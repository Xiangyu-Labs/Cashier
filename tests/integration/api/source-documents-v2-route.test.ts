import { createHash, randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { POST as createUpload } from "@/app/api/v2/uploads/route";
import { POST as createSourceDocument } from "@/app/api/v2/source-documents/route";
import { getTestDb } from "../../setup";
import { createTestUserWithLedger } from "../../helpers/schema-setup";
import {
  idempotencyRecords,
  ledgers,
  serviceCredentials,
  sourceDocuments,
  storedFiles,
  uploadSessions,
} from "@/persistence";
import { computeHash, prefixSuffix } from "@/lib/security/service-credential-token";

const mockR2 = vi.hoisted(() => {
  const files = new Map<string, Buffer>();
  const metadata = new Map<
    string,
    { byteSize: number; contentType: string; metadata: Record<string, string> }
  >();
  const storage = {
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
      metadata.delete(key);
      return { success: true };
    },
    presignUpload: async (key: string, contentType: string, sha256: string) => ({
      url: `https://r2.test/${key}`,
      requiredHeaders: {
        "Content-Type": contentType,
        "x-amz-meta-sha256": sha256,
      },
    }),
    head: async (key: string) => {
      const value = metadata.get(key);
      if (value == null) throw new Error("File not found");
      return value;
    },
    copy: async (sourceKey: string, destinationKey: string) => {
      const data = files.get(sourceKey);
      if (data == null) throw new Error("File not found");
      files.set(destinationKey, Buffer.from(data));
    },
  };
  return { files, metadata, storage };
});

vi.mock("@/lib/storage/s3", () => ({
  getS3Storage: () => mockR2.storage,
  S3StorageProvider: class {},
}));

const TEST_USER_ID = "10000000-0000-4000-8000-000000000002";

describe("API v2 direct source-document ingestion", () => {
  let ledgerId: string;
  let credentialId: string;
  let credentialKey: string;

  beforeEach(async () => {
    const db = getTestDb();
    mockR2.files.clear();
    mockR2.metadata.clear();
    await db.delete(ledgers).where(eq(ledgers.userId, TEST_USER_ID));
    ({ ledgerId } = await createTestUserWithLedger(
      db,
      undefined,
      "API v2 Test Ledger",
      TEST_USER_ID
    ));
    credentialKey = `sk_v2_${randomUUID().replaceAll("-", "")}`;
    const { prefix, suffix } = prefixSuffix(credentialKey);
    credentialId = await db
      .insert(serviceCredentials)
      .values({
        ledgerId,
        name: "API v2 Credential",
        tokenHash: computeHash(credentialKey),
        tokenPrefix: prefix,
        tokenSuffix: suffix,
      })
      .returning({ id: serviceCredentials.id })
      .then((rows) => rows[0]!.id);
  });

  it("creates a direct upload and finalizes it into one idempotent source document", async () => {
    const bytes = await sharp({
      create: { width: 2, height: 2, channels: 3, background: "white" },
    })
      .jpeg()
      .toBuffer();
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const uploadResponse = await createUpload(
      new NextRequest("http://localhost/api/v2/uploads", {
        method: "POST",
        headers: { Authorization: `Bearer ${credentialKey}` },
        body: JSON.stringify({
          files: [
            {
              contentType: "image/jpeg",
              byteSize: bytes.length,
              sha256,
              originalFilename: "receipt.jpg",
            },
          ],
        }),
      })
    );
    expect(uploadResponse.status).toBe(201);
    const upload = await uploadResponse.json();
    expect(upload.targets).toHaveLength(1);
    expect(upload.targets[0]).toMatchObject({
      method: "PUT",
      requiredHeaders: {
        "Content-Type": "image/jpeg",
        "x-amz-meta-sha256": sha256,
      },
    });

    const temporaryKey = new URL(upload.targets[0].url).pathname.slice(1);
    mockR2.files.set(temporaryKey, bytes);
    mockR2.metadata.set(temporaryKey, {
      byteSize: bytes.length,
      contentType: "image/jpeg",
      metadata: { sha256 },
    });
    const requestBody = JSON.stringify({
      entryDate: "2026-07-26",
      text: "Direct upload receipt",
      upload: {
        uploadSessionId: upload.uploadSessionId,
        finalizationToken: upload.finalizationToken,
        targetIds: [upload.targets[0].id],
      },
    });
    const makeRequest = () =>
      new NextRequest("http://localhost/api/v2/source-documents", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${credentialKey}`,
          "Idempotency-Key": "direct-receipt-1",
        },
        body: requestBody,
      });
    const first = await createSourceDocument(makeRequest());
    const second = await createSourceDocument(makeRequest());
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    const firstBody = await first.json();
    expect(await second.json()).toEqual(firstBody);
    expect(firstBody).toMatchObject({ revisionState: "processing" });
    expect(firstBody).not.toHaveProperty("status");

    const db = getTestDb();
    expect(
      await db.select().from(sourceDocuments).where(eq(sourceDocuments.ledgerId, ledgerId))
    ).toHaveLength(1);
    expect(
      await db.select().from(storedFiles).where(eq(storedFiles.ledgerId, ledgerId))
    ).toMatchObject([{ id: upload.targets[0].id, checksum: sha256 }]);
    expect(
      await db.query.uploadSessions.findFirst({
        where: eq(uploadSessions.id, upload.uploadSessionId),
      })
    ).toMatchObject({ transport: "direct", status: "finalized" });
    expect(
      await db.query.idempotencyRecords.findFirst({
        where: eq(idempotencyRecords.key, `api-v2:${credentialId}:direct-receipt-1`),
      })
    ).toMatchObject({ status: "completed" });
  });

  it("submits text without an upload session and rejects v2 inline-image fields", async () => {
    const textResponse = await createSourceDocument(
      new NextRequest("http://localhost/api/v2/source-documents", {
        method: "POST",
        headers: { Authorization: `Bearer ${credentialKey}` },
        body: JSON.stringify({ entryDate: "2026-07-26", text: "Coffee 18" }),
      })
    );
    expect(textResponse.status).toBe(201);

    const invalidResponse = await createSourceDocument(
      new NextRequest("http://localhost/api/v2/source-documents", {
        method: "POST",
        headers: { Authorization: `Bearer ${credentialKey}` },
        body: JSON.stringify({
          entryDate: "2026-07-26",
          images: [{ data: "base64", mimeType: "image/jpeg" }],
        }),
      })
    );
    expect(invalidResponse.status).toBe(400);
  });
});
