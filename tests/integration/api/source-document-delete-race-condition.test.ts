import { describe, it, expect, beforeEach } from "vitest";
import { deleteSourceDocumentAction } from "@/features/source-document/server/actions";
import { getTestDb } from "../../setup";
import {
  entryCategories as categories,
  sourceDocuments,
  ledgers,
} from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createTestUserWithLedger, TEST_USER_ID } from "../../helpers/schema-setup";
import { NotFoundError } from "@/lib/errors";

/**
 * 复现问题：删除流水时出现"删除失败"错误
 *
 * 问题场景：
 * 1. 用户在流水Tab页面看到一条流水记录
 * 2. 用户点击删除按钮，弹出确认对话框
 * 3. 【竞态条件】在对话框打开期间，后台进程（如任务处理）软删除了该记录
 * 4. 用户点击"确认删除"
 * 5. Server Action 查询时发现记录已软删除（deletedAt 不为 null）
 * 6. 抛出 NotFoundError，前端显示"删除失败"
 * 7. 用户刷新页面，记录重新出现（因为查询的是未软删除的记录）
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

  it("should throw NotFoundError when trying to delete an already soft-deleted source document", async () => {
    const db = getTestDb();

    // 1. 创建一条流水记录
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

    // 2. 【模拟竞态条件】在"弹窗打开期间"，记录被其他进程软删除
    // 这可能是后台任务处理、其他用户操作、或自动清理进程
    await db
      .update(sourceDocuments)
      .set({ deletedAt: new Date() })
      .where(eq(sourceDocuments.id, sourceDoc.id));

    // 验证记录已被软删除
    const softDeletedDoc = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, sourceDoc.id),
    });
    expect(softDeletedDoc?.deletedAt).not.toBeNull();

    // 3. 用户点击"确认删除"，尝试删除已软删除的记录
    // 应该抛出 NotFoundError，因为 whereActive 条件包含 deletedAt IS NULL
    await expect(
      deleteSourceDocumentAction(testLedgerId, sourceDoc.id)
    ).rejects.toThrow(NotFoundError);

    // 验证错误消息 (NotFoundError 会自动添加 " not found" 后缀)
    await expect(
      deleteSourceDocumentAction(testLedgerId, sourceDoc.id)
    ).rejects.toThrow("Source document not found not found");
  });

  it("should throw NotFoundError when trying to delete non-existent source document", async () => {
    const nonExistentId = "00000000-0000-0000-0000-000000000000";

    await expect(
      deleteSourceDocumentAction(testLedgerId, nonExistentId)
    ).rejects.toThrow(NotFoundError);
  });

  it("should demonstrate the race condition flow with timeline", async () => {
    const db = getTestDb();

    // T0: 创建流水记录
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

    // T1: 用户点击删除按钮，弹窗打开
    // （前端此时显示确认弹窗）

    // T2: 【竞态条件触发】后台进程软删除该记录
    await db
      .update(sourceDocuments)
      .set({ deletedAt: new Date() })
      .where(eq(sourceDocuments.id, sourceDoc.id));

    console.log("T2: 后台进程软删除了记录");

    // T3: 用户点击"确认删除"
    // Server Action 查询时使用 whereActive = ledgerId = ? AND deletedAt IS NULL
    // 查询不到记录，抛出 NotFoundError

    try {
      await deleteSourceDocumentAction(testLedgerId, sourceDoc.id);
      // 不应该执行到这里
      expect.fail("应该抛出 NotFoundError");
    } catch (error) {
      // T4: 验证错误类型
      expect(error).toBeInstanceOf(NotFoundError);
      expect((error as Error).message).toBe("Source document not found not found");
      console.log("T4: 删除操作抛出 NotFoundError");
    }

    // T5: 验证记录仍然存在（只是被软删除）
    const docInDb = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, sourceDoc.id),
    });
    expect(docInDb).toBeDefined();
    expect(docInDb?.deletedAt).not.toBeNull();
    console.log("T5: 记录仍在数据库中，只是被软删除");

    // T6: 模拟前端刷新页面 - 查询未软删除的记录
    const activeDocs = await db.query.sourceDocuments.findMany({
      where: eq(sourceDocuments.ledgerId, testLedgerId),
    });
    // 由于记录已被软删除，查询会过滤掉它
    const foundDoc = activeDocs.find((d) => d.id === sourceDoc.id);
    console.log("T6: 刷新后查询结果", {
      totalActiveDocs: activeDocs.length,
      foundDoc: foundDoc?.id ?? null,
    });

    // 注意：如果前端查询包含软删除的记录，它会重新出现
    // 这就是为什么用户刷新后看到记录又出现了
  });

  it("should succeed when deleting an active source document normally", async () => {
    const db = getTestDb();

    // 创建一条正常的流水记录
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

    // 正常删除应该成功
    await deleteSourceDocumentAction(testLedgerId, sourceDoc.id);

    // 验证记录已被软删除
    const deletedDoc = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, sourceDoc.id),
    });
    expect(deletedDoc?.deletedAt).not.toBeNull();
  });
});
