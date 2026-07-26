import { asc, eq, isNull, and } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSourceDocumentAction,
  editRetrySourceDocumentAction,
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
            amount: "50",
            currency: "CNY",
            category_index: 1,
            entry_date: "2026-07-15",
          },
        ],
      }) as unknown as ReturnType<typeof getOpenAIClient>
    );
    const retried = await editRetrySourceDocumentAction(ledgerId, created.sourceDocumentId, {
      text: "晚餐 50元",
    });
    expect(retried).toMatchObject({
      sourceDocumentId: created.sourceDocumentId,
      previousSourceDocumentId: created.sourceDocumentId,
      status: "processing",
    });
    await processAllPendingTasks();

    const after = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, created.sourceDocumentId),
    });
    const revisions = await db.query.sourceDocumentRevisions.findMany({
      where: eq(sourceDocumentRevisions.sourceDocumentId, created.sourceDocumentId),
      orderBy: asc(sourceDocumentRevisions.revisionNumber),
    });
    const activeEntries = await db.query.ledgerEntries.findMany({
      where: and(
        eq(ledgerEntries.sourceDocumentId, created.sourceDocumentId),
        eq(ledgerEntries.sourceDocumentRevisionId, after!.activeRevisionId!),
        isNull(ledgerEntries.deletedAt)
      ),
    });

    // Document has an active revision and a completed pending candidate
    expect(after).toMatchObject({
      id: created.sourceDocumentId,
      status: "processing",
      deletedAt: null,
    });
    expect(after?.pendingRevisionId).not.toBeNull();
    expect(after?.activeRevisionId).toBe(before?.activeRevisionId);
    expect(revisions).toHaveLength(2);
    expect(revisions[0]?.outcome).toBe("completed");
    expect(revisions[1]?.outcome).toBe("completed");
    // Active entries are from the original parse (candidate not auto-activated)
    expect(activeEntries).toMatchObject([{ itemName: "午餐" }]);
  });

  it("rejects raw image payloads that bypass upload finalization", async () => {
    const created = await createSourceDocumentAction(ledgerId, { text: "Lunch 25" });
    await processAllPendingTasks();
    await expect(
      editRetrySourceDocumentAction(ledgerId, created.sourceDocumentId, {
        images: [{ data: "/api/uploads/private.jpg", mimeType: "image/jpeg" }],
      })
    ).rejects.toThrow("Images must be finalized");
  });

  it("retry succeeds despite a previous failed revision, preserving the original active revision", async () => {
    const db = getTestDb();

    // Step 1: Create a document and process it successfully
    const created = await createSourceDocumentAction(ledgerId, { text: "午餐 25元" });
    await processAllPendingTasks();

    const before = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, created.sourceDocumentId),
    });
    expect(before?.activeRevisionId).not.toBeNull();
    const originalActiveRevisionId = before!.activeRevisionId;

    // Step 2: Retry with a broken AI mock that causes processing failure
    vi.mocked(getOpenAIClient).mockReturnValue({
      generateContent: vi.fn().mockRejectedValue(new Error("AI service failure")),
    } as unknown as ReturnType<typeof getOpenAIClient>);

    await editRetrySourceDocumentAction(ledgerId, created.sourceDocumentId, {
      text: "修改 50元",
    });
    await processAllPendingTasks();

    // Step 3: Verify the previous active revision is preserved despite the failed retry
    const afterFail = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, created.sourceDocumentId),
    });
    expect(afterFail?.activeRevisionId).toBe(originalActiveRevisionId);

    const revisions1 = await db.query.sourceDocumentRevisions.findMany({
      where: eq(sourceDocumentRevisions.sourceDocumentId, created.sourceDocumentId),
      orderBy: asc(sourceDocumentRevisions.revisionNumber),
    });
    expect(revisions1).toHaveLength(2);
    expect(revisions1[0]?.outcome).toBe("completed");
    expect(revisions1[1]?.outcome).toBe("failed");

    // Step 4: Retry a second time with a working AI mock
    vi.mocked(getOpenAIClient).mockReturnValue(
      createMultiStageMock({
        title: "晚餐费用",
        entries: [
          {
            item_name: "晚餐",
            amount: "50",
            currency: "CNY",
            category_index: 1,
            entry_date: "2026-07-15",
          },
        ],
      }) as unknown as ReturnType<typeof getOpenAIClient>
    );

    const retried = await editRetrySourceDocumentAction(ledgerId, created.sourceDocumentId, {
      text: "晚餐 50元",
    });
    expect(retried.status).toBe("processing");
    await processAllPendingTasks();

    // Step 5: Verify final state — 3 revisions, candidate is pending, original active preserved
    const afterRetry = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, created.sourceDocumentId),
    });
    expect(afterRetry?.pendingRevisionId).not.toBeNull();
    expect(afterRetry?.activeRevisionId).toBe(originalActiveRevisionId);

    const revisions2 = await db.query.sourceDocumentRevisions.findMany({
      where: eq(sourceDocumentRevisions.sourceDocumentId, created.sourceDocumentId),
      orderBy: asc(sourceDocumentRevisions.revisionNumber),
    });
    expect(revisions2).toHaveLength(3);
    expect(revisions2[0]?.outcome).toBe("completed"); // original
    expect(revisions2[1]?.outcome).toBe("failed"); // failed retry
    expect(revisions2[2]?.outcome).toBe("completed"); // successful retry candidate

    const activeEntries = await db.query.ledgerEntries.findMany({
      where: and(
        eq(ledgerEntries.sourceDocumentId, created.sourceDocumentId),
        eq(ledgerEntries.sourceDocumentRevisionId, afterRetry!.activeRevisionId!),
        isNull(ledgerEntries.deletedAt)
      ),
    });
    // Active entries are from the original parse (candidate not auto-activated)
    expect(activeEntries).toMatchObject([{ itemName: "午餐" }]);
  });
});
