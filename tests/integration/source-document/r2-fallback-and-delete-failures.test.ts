import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { deleteSourceDocumentAction, retrySourceDocumentAction } from "@/modules/source-document/actions";
import { getTestDb } from "tests/setup";
import { ledgers, sourceDocuments } from "@/persistence";
import { createTestUserWithLedger, TEST_USER_ID } from "tests/helpers/schema-setup";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

import { auth } from "@/auth";

describe("source-document storage fallback and delete tolerance", () => {
  let ledgerId = "";

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(
      auth as unknown as () => Promise<{
        user: { id: string; email: string };
        expires: string;
      } | null>
    ).mockResolvedValue({
      user: { id: TEST_USER_ID, email: "test@example.com" },
      expires: new Date(Date.now() + 3600 * 1000).toISOString(),
    });

    const db = getTestDb();
    await db.delete(ledgers).where(eq(ledgers.userId, TEST_USER_ID));
    const setup = await createTestUserWithLedger(db, undefined, "Source Doc R2 Ledger", TEST_USER_ID);
    ledgerId = setup.ledgerId;
  });

  it("preserves existing external upload URLs during retry when no replacement images are provided", async () => {
    const db = getTestDb();
    const [oldDoc] = await db
      .insert(sourceDocuments)
      .values({
        ledgerId,
        text: "Old external image doc",
        imageUrls: ["https://bucket.r2.dev/ledger-1/doc-1/image.jpg"],
        status: "failed",
        entryDate: "2026-03-20",
      })
      .returning();

    if (oldDoc == null) {
      throw new Error("Expected old source document");
    }

    const result = await retrySourceDocumentAction(ledgerId, oldDoc.id, {
      text: "Retried text",
    });

    const retried = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, result.sourceDocumentId),
    });

    expect(retried?.imageUrls).toEqual(["https://bucket.r2.dev/ledger-1/doc-1/image.jpg"]);
    expect(retried?.status).toBe("queued");
  });

  it("returns deleted false instead of throwing when the document is already soft deleted", async () => {
    const db = getTestDb();
    const [doc] = await db
      .insert(sourceDocuments)
      .values({
        ledgerId,
        text: "delete me",
        imageUrls: [],
        status: "completed",
        entryDate: "2026-03-20",
      })
      .returning();

    if (doc == null) {
      throw new Error("Expected source document");
    }

    await expect(deleteSourceDocumentAction(ledgerId, doc.id)).resolves.toEqual({
      sourceDocumentId: doc.id,
      deleted: true,
    });

    await expect(deleteSourceDocumentAction(ledgerId, doc.id)).resolves.toEqual({
      sourceDocumentId: doc.id,
      deleted: false,
    });
  });
});
