import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { deleteSourceDocumentAction } from "@/modules/source-document/actions";
import { getTestDb } from "tests/setup";
import { ledgers, sourceDocuments } from "@/persistence";
import { createTestUserWithLedger, TEST_USER_ID } from "tests/helpers/schema-setup";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/auth";

describe("source-document delete tolerance", () => {
  let ledgerId = "";

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(auth as unknown as () => Promise<unknown>).mockResolvedValue({
      user: { id: TEST_USER_ID, email: "test@example.com" },
      expires: new Date(Date.now() + 3600 * 1000).toISOString(),
    });
    const db = getTestDb();
    await db.delete(ledgers).where(eq(ledgers.userId, TEST_USER_ID));
    ({ ledgerId } = await createTestUserWithLedger(
      db,
      undefined,
      "Source Document Ledger",
      TEST_USER_ID
    ));
  });

  it("returns deleted false instead of throwing when the document is already soft deleted", async () => {
    const db = getTestDb();
    const [document] = await db
      .insert(sourceDocuments)
      .values({ ledgerId, text: "delete me", status: "completed" })
      .returning();
    await expect(deleteSourceDocumentAction(ledgerId, document!.id)).resolves.toEqual({
      sourceDocumentId: document!.id,
      deleted: true,
    });
    await expect(deleteSourceDocumentAction(ledgerId, document!.id)).resolves.toEqual({
      sourceDocumentId: document!.id,
      deleted: false,
    });
  });
});
