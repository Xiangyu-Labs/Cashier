import { describe, it, expect, beforeEach } from "vitest";
import { deleteSourceDocumentAction } from "@/features/source-document/server/actions";
import { getTestDb } from "../../setup";
import {
  entryCategories as categories,
  sourceDocuments,
  ledgers,
} from "@/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { createTestUserWithLedger, TEST_USER_ID } from "../../helpers/schema-setup";

/**
 * 删除流水幂等性测试
 *
 * 场景：
 * 1. 用户在流水Tab页面看到一条流水记录
 * 2. 用户点击删除按钮，弹出确认对话框
 * 3. 【竞态条件】在对话框打开期间，后台进程（如任务处理）软删除了该记录
 * 4. 用户点击"确认删除"
 * 5. Server Action 查询时发现记录已软删除（deletedAt 不为 null）
 * 6. 【修复前】抛出 NotFoundError，前端显示"删除失败"
 * 7. 【修复后】静默成功，因为目标状态（已删除）已经达成
 */
describe("SourceDocument Delete Race Condition", () => {
  let testLedgerId: string;

  beforeEach(async () => {
    const db = getTestDb();

    // Clean up existing ledger for TEST_USER_ID and create new one
    await db.delete(ledgers).where(eq(ledgers.userId, TEST_USER_ID));
    const { ledgerId } = await createTestUserWithLedger(db, undefined, "Test Ledger", TEST_USER_ID);
    testLedgerId = ledgerId;

    // Create a test category
    await db.insert(categories).values({
      name: "测试分类",
      description: "Test category",
      sortOrder: 1,
      ledgerId: testLedgerId,
    });
  });

  it("should silently succeed when trying to delete an already soft-deleted source document (idempotent)", async () => {
    const db = getTestDb();

    // 1. Create a source document
    const [sourceDoc] = await db
      .insert(sourceDocuments)
      .values({
        ledgerId: testLedgerId,
        text: "待删除的流水记录",
        status: "completed",
        imageUrls: [],
        entryDate: "2024-03-17",
      })
      .returning();

    expect(sourceDoc.id).toBeDefined();
    expect(sourceDoc.deletedAt).toBeNull();

    // 2. [Simulate race condition] Record is soft-deleted by another process
    await db
      .update(sourceDocuments)
      .set({ deletedAt: new Date() })
      .where(eq(sourceDocuments.id, sourceDoc.id));

    // Verify record is soft-deleted
    const softDeletedDoc = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, sourceDoc.id),
    });
    expect(softDeletedDoc?.deletedAt).not.toBeNull();

    // 3. User clicks "confirm delete" - should silently succeed (idempotent)
    await expect(
      deleteSourceDocumentAction(testLedgerId, sourceDoc.id)
    ).resolves.toBeUndefined();

    // Verify record is still soft-deleted
    const stillDeleted = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, sourceDoc.id),
    });
    expect(stillDeleted?.deletedAt).not.toBeNull();
  });

  it("should silently succeed when trying to delete non-existent source document (idempotent)", async () => {
    const nonExistentId = "00000000-0000-0000-0000-000000000000";

    // Should silently succeed (idempotent)
    await expect(
      deleteSourceDocumentAction(testLedgerId, nonExistentId)
    ).resolves.toBeUndefined();
  });

  it("should demonstrate the idempotent delete flow with timeline", async () => {
    const db = getTestDb();

    // T0: Create source document
    const [sourceDoc] = await db
      .insert(sourceDocuments)
      .values({
        ledgerId: testLedgerId,
        text: "鸡蛋 16元",
        status: "completed",
        imageUrls: [],
        entryDate: "2024-03-17",
      })
      .returning();

    console.log("T0: 创建流水记录", { id: sourceDoc.id, deletedAt: sourceDoc.deletedAt });

    // T1: User clicks delete button, dialog opens
    // (Frontend shows confirmation dialog)

    // T2: [Race condition] Background process soft-deletes the record
    await db
      .update(sourceDocuments)
      .set({ deletedAt: new Date() })
      .where(eq(sourceDocuments.id, sourceDoc.id));

    console.log("T2: 后台进程软删除了记录");

    // T3: User clicks "confirm delete"
    // [Before fix] Server Action throws NotFoundError
    // [After fix] Server Action silently succeeds
    const result = await deleteSourceDocumentAction(testLedgerId, sourceDoc.id);
    console.log("T3: 删除操作成功完成（幂等）", result);

    // T4: Verify record still exists (soft-deleted)
    const docInDb = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, sourceDoc.id),
    });
    expect(docInDb).toBeDefined();
    expect(docInDb?.deletedAt).not.toBeNull();
    console.log("T4: 记录仍在数据库中，只是被软删除");

    // T5: Simulate frontend refresh - query active records (excluding soft-deleted)
    const activeDocs = await db.query.sourceDocuments.findMany({
      where: and(
        eq(sourceDocuments.ledgerId, testLedgerId),
        isNull(sourceDocuments.deletedAt)
      ),
    });
    const foundDoc = activeDocs.find((d) => d.id === sourceDoc.id);
    console.log("T5: 刷新后查询结果", {
      totalActiveDocs: activeDocs.length,
      foundDoc: foundDoc?.id ?? null,
    });

    // Record should not appear in active list
    expect(foundDoc).toBeUndefined();
  });

  it("should succeed when deleting an active source document normally", async () => {
    const db = getTestDb();

    // Create a normal source document
    const [sourceDoc] = await db
      .insert(sourceDocuments)
      .values({
        ledgerId: testLedgerId,
        text: "正常删除的流水",
        status: "completed",
        imageUrls: [],
        entryDate: "2024-03-17",
      })
      .returning();

    // Normal delete should succeed
    await deleteSourceDocumentAction(testLedgerId, sourceDoc.id);

    // Verify record is soft-deleted
    const deletedDoc = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, sourceDoc.id),
    });
    expect(deletedDoc?.deletedAt).not.toBeNull();
  });
});
