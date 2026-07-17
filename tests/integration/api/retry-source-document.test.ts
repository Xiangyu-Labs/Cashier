import { eq, isNull, and } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSourceDocumentAction,
  retrySourceDocumentAction,
} from "@/modules/source-document/actions";
import { getOpenAIClient } from "@/lib/ai/openai-client";
import { createMultiStageMock } from "../../helpers/mocks/openai";
import { processAllPendingTasks } from "../../helpers/processing";
import { createTestUserWithLedger, TEST_USER_ID } from "../../helpers/schema-setup";
import { getTestDb } from "../../setup";
import {
  entryCategories,
  ledgerEntries,
  ledgers,
  sourceDocumentRevisions,
  sourceDocuments,
} from "@/persistence";

vi.mock("@/lib/ai/openai-client", () => ({
  getOpenAIClient: vi.fn(),
  resetOpenAIClient: vi.fn(),
}));

describe("source-document retry action", () => {
  let ledgerId = "";

  beforeEach(async () => {
    vi.mocked(getOpenAIClient).mockReturnValue(
      createMultiStageMock() as unknown as ReturnType<typeof getOpenAIClient>
    );
    const db = getTestDb();
    await db.delete(ledgers).where(eq(ledgers.userId, TEST_USER_ID));
    ({ ledgerId } = await createTestUserWithLedger(db, undefined, "Retry Ledger", TEST_USER_ID));
    await db.insert(entryCategories).values({
      ledgerId,
      name: "餐饮",
      description: "餐饮服务",
      sortOrder: 1,
    });
  });

  it("reprocesses a new revision while keeping the source-document identity stable", async () => {
    const db = getTestDb();
    const created = await createSourceDocumentAction(ledgerId, { text: "午餐 25元" });
    await processAllPendingTasks();
    const before = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, created.sourceDocumentId),
    });
    expect(before?.activeRevisionId).not.toBeNull();
    await expect(
      db.query.sourceDocumentRevisions.findFirst({
        where: eq(sourceDocumentRevisions.id, before!.activeRevisionId!),
      })
    ).resolves.toMatchObject({ outcome: "completed" });

    vi.mocked(getOpenAIClient).mockReturnValue(
      createMultiStageMock({
        title: "晚餐费用",
        entries: [
          {
            item_name: "晚餐",
            amount: 50,
            currency: "CNY",
            category_index: 1,
            entry_date: "2026-07-15",
          },
        ],
      }) as unknown as ReturnType<typeof getOpenAIClient>
    );
    const retried = await retrySourceDocumentAction(ledgerId, created.sourceDocumentId, {
      text: "晚餐 50元",
    });
    expect(retried).toMatchObject({
      sourceDocumentId: created.sourceDocumentId,
      previousSourceDocumentId: created.sourceDocumentId,
      status: "queued",
    });
    await processAllPendingTasks();

    const after = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, created.sourceDocumentId),
    });
    const revisions = await db.query.sourceDocumentRevisions.findMany({
      where: eq(sourceDocumentRevisions.sourceDocumentId, created.sourceDocumentId),
    });
    const activeEntries = await db.query.ledgerEntries.findMany({
      where: and(
        eq(ledgerEntries.sourceDocumentId, created.sourceDocumentId),
        isNull(ledgerEntries.deletedAt)
      ),
    });
    expect(after).toMatchObject({
      id: created.sourceDocumentId,
      status: "queued",
      deletedAt: null,
      pendingRevisionId: null,
    });
    expect(after?.activeRevisionId).not.toBe(before?.activeRevisionId);
    expect(revisions).toHaveLength(2);
    expect(activeEntries).toMatchObject([{ itemName: "晚餐", amount: "50.00" }]);
  });

  it("rejects raw image payloads that bypass upload finalization", async () => {
    const created = await createSourceDocumentAction(ledgerId, { text: "Lunch 25" });
    await processAllPendingTasks();
    await expect(
      retrySourceDocumentAction(ledgerId, created.sourceDocumentId, {
        images: [{ data: "/api/uploads/private.jpg", mimeType: "image/jpeg" }],
      })
    ).rejects.toThrow("Images must be finalized");
  });
});
