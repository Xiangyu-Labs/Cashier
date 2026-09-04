import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { deleteSourceDocumentAction } from "@/modules/source-document/actions";
import { ledgers, sourceDocuments } from "@/persistence";
import {
  activateTestSourceDocumentProjection,
  createTestUserWithLedger,
  TEST_USER_ID,
} from "../../helpers/schema-setup";
import { getTestDb } from "../../setup";

describe("SourceDocument delete CAS", () => {
  let ledgerId: string;

  beforeEach(async () => {
    const db = getTestDb();
    await db.delete(ledgers).where(eq(ledgers.userId, TEST_USER_ID));
    ({ ledgerId } = await createTestUserWithLedger(db, undefined, "Test Ledger", TEST_USER_ID));
  });

  async function createDocument() {
    const db = getTestDb();
    const [document] = await db
      .insert(sourceDocuments)
      .values({ ledgerId, currentStatus: "completed", entryDate: "2024-03-17" })
      .returning();
    if (document == null) throw new Error("Expected source document");
    await activateTestSourceDocumentProjection(db, document.id);
    return document;
  }

  it("deletes once and increments the document version once", async () => {
    const document = await createDocument();
    await expect(deleteSourceDocumentAction(ledgerId, document.id, 1)).resolves.toEqual({
      ok: true,
      sourceDocumentId: document.id,
      version: 2,
      data: { sourceDocumentId: document.id, deleted: true },
    });
    const deleted = await getTestDb().query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, document.id),
    });
    expect(deleted?.deletedAt).not.toBeNull();
    expect(deleted?.stateVersion).toBe(2);
  });

  it("does not durably replay a lost delete response", async () => {
    const document = await createDocument();
    await deleteSourceDocumentAction(ledgerId, document.id, 1);
    await expect(deleteSourceDocumentAction(ledgerId, document.id, 1)).rejects.toThrow();
    const deleted = await getTestDb().query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, document.id),
    });
    expect(deleted?.stateVersion).toBe(2);
  });
});
