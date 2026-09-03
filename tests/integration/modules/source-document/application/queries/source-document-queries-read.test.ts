import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { NotFoundError } from "@/lib/errors";
import { getSourceDocumentFullQuery as getSourceDocumentFullQueryUseCase } from "@/modules/source-document/application/queries/get-source-document-full";
import { sourceDocuments } from "@/persistence";
import { serverComposition } from "@/application/server-composition-root";
import { createTestSourceDocument, createTestUserWithLedger } from "tests/helpers/schema-setup";
import { getTestDb } from "tests/setup";

const getSourceDocumentFullQuery = (ledgerId: string, sourceDocumentId: string) =>
  getSourceDocumentFullQueryUseCase(
    ledgerId,
    sourceDocumentId,
    serverComposition.sourceDocumentReads
  );

describe("source-document full query", () => {
  let ledgerId = "";

  beforeEach(async () => {
    const setup = await createTestUserWithLedger(getTestDb());
    ledgerId = setup.ledgerId;
  });

  it("returns full evidence without leaking storage locations", async () => {
    const docId = await createTestSourceDocument(getTestDb(), ledgerId, {
      text: "full payload",
      status: "processing",
      imageUrls: ["/api/uploads/a.jpg"],
      entryDate: "2026-03-22",
    });

    const existing = await getSourceDocumentFullQuery(ledgerId, docId);

    expect(existing).toMatchObject({
      id: docId,
      text: "full payload",
      files: [expect.objectContaining({ id: expect.any(String), contentType: "image/jpeg" })],
      status: "processing",
      createdAt: expect.any(String),
    });
    expect(existing).not.toHaveProperty("imageUrls");
    await expect(getSourceDocumentFullQuery(ledgerId, crypto.randomUUID())).rejects.toThrow(
      NotFoundError
    );
  });

  it("hides soft-deleted documents", async () => {
    const db = getTestDb();
    const [deletedDocument] = await db
      .insert(sourceDocuments)
      .values({
        ledgerId,
        currentStatus: "completed",
        deletedAt: new Date(),
        entryDate: "2026-03-22",
      })
      .returning();

    expect(deletedDocument).toBeDefined();
    await expect(getSourceDocumentFullQuery(ledgerId, deletedDocument!.id)).rejects.toThrow(
      NotFoundError
    );

    const stored = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, deletedDocument!.id),
    });
    expect(stored?.deletedAt).not.toBeNull();
  });
});
