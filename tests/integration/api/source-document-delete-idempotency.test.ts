import { describe, it, expect, beforeEach } from "vitest";
import { deleteSourceDocumentAction } from "@/features/source-document/server/actions";
import { getTestDb } from "../../setup";
import {
  entryCategories as categories,
  sourceDocuments,
  ledgers,
} from "@/persistence";
import { eq, and, isNull } from "drizzle-orm";
import { createTestUserWithLedger, TEST_USER_ID } from "../../helpers/schema-setup";

/**
 * 删除操作的幂等性测试
 *
 * 问题场景：竞态条件导致删除已软删除的记录时抛出 NotFoundError
 *
 * 正确行为：删除应该是幂等的 - 多次删除同一条记录应该成功（或至少不抛错）
 */
describe("SourceDocument Delete Idempotency", () => {
  let testLedgerId: string;

  beforeEach(async () => {
    const db = getTestDb();
    await db.delete(ledgers).where(eq(ledgers.userId, TEST_USER_ID));
    const { ledgerId } = await createTestUserWithLedger(db, undefined, "Test Ledger", TEST_USER_ID);
    testLedgerId = ledgerId;

    await db.insert(categories).values({
      name: "测试分类",
      description: "Test category",
      sortOrder: 1,
      ledgerId: testLedgerId,
    });
  });

  it("应该允许重复删除同一条记录（幂等性）", async () => {
    const db = getTestDb();

    // 1. 创建流水记录
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

    // 2. 第一次删除 - 应该成功
    await expect(
      deleteSourceDocumentAction(testLedgerId, sourceDoc.id)
    ).resolves.not.toThrow();

    // 3. 【问题】第二次删除同一条记录（模拟竞态条件或重复点击）
    // 当前行为：抛出 NotFoundError ❌
    // 期望行为：应该成功（幂等）✅
    await expect(
      deleteSourceDocumentAction(testLedgerId, sourceDoc.id)
    ).resolves.not.toThrow();  // 修复后这行应该通过

    // 4. 验证记录被软删除
    const deletedDoc = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, sourceDoc.id),
    });
    expect(deletedDoc?.deletedAt).not.toBeNull();
  });

  it("删除已软删除的记录应该静默成功，而不是抛出错误", async () => {
    const db = getTestDb();

    // 1. 创建并软删除记录（模拟后台进程或之前的删除操作）
    const [sourceDoc] = await db
      .insert(sourceDocuments)
      .values({
        ledgerId: testLedgerId,
        text: "已被后台软删除的流水",
        status: "completed",
        imageUrls: [],
        entryDate: "2024-03-17",
      })
      .returning();

    // 2. 【模拟竞态条件】后台进程软删除了记录
    await db
      .update(sourceDocuments)
      .set({ deletedAt: new Date() })
      .where(eq(sourceDocuments.id, sourceDoc.id));

    // 3. 用户尝试删除这条"已不存在"的记录
    // 当前行为：抛出 NotFoundError，用户看到"删除失败" ❌
    // 期望行为：静默成功，因为目标状态（已删除）已经达成 ✅
    await expect(
      deleteSourceDocumentAction(testLedgerId, sourceDoc.id)
    ).resolves.toBeUndefined();  // 修复后应该返回 undefined（成功）

    // 4. 验证记录仍然被软删除（状态未改变）
    const doc = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, sourceDoc.id),
    });
    expect(doc?.deletedAt).not.toBeNull();
  });

  it("并发删除同一条记录应该都能成功", async () => {
    const db = getTestDb();

    // 1. 创建流水记录
    const [sourceDoc] = await db
      .insert(sourceDocuments)
      .values({
        ledgerId: testLedgerId,
        text: "并发删除测试",
        status: "completed",
        imageUrls: [],
        entryDate: "2024-03-17",
      })
      .returning();

    // 2. 模拟两个并发的删除请求
    // 请求1：先删除成功
    const delete1 = deleteSourceDocumentAction(testLedgerId, sourceDoc.id);

    // 请求2：尝试删除同一条记录（可能在请求1完成前或后到达）
    // 当前行为：可能抛出 NotFoundError ❌
    // 期望行为：应该成功（幂等）✅
    const delete2 = deleteSourceDocumentAction(testLedgerId, sourceDoc.id);

    // 两个请求都应该成功（不抛出错误）
    const [result1, result2] = await Promise.allSettled([delete1, delete2]);

    // 期望：两个都成功（fulfilled）
    expect(result1.status).toBe("fulfilled");
    expect(result2.status).toBe("fulfilled");  // 修复后这行应该通过

    // 验证记录被软删除
    const doc = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, sourceDoc.id),
    });
    expect(doc?.deletedAt).not.toBeNull();
  });

  it("删除已软删除的记录不应导致数据不一致", async () => {
    const db = getTestDb();

    // 1. 创建流水记录
    const [sourceDoc] = await db
      .insert(sourceDocuments)
      .values({
        ledgerId: testLedgerId,
        text: "数据一致性测试",
        status: "completed",
        imageUrls: [],
        entryDate: "2024-03-17",
      })
      .returning();

    // 2. 【模拟竞态条件】记录被其他进程软删除
    await db
      .update(sourceDocuments)
      .set({ deletedAt: new Date() })
      .where(eq(sourceDocuments.id, sourceDoc.id));

    // 3. 用户尝试删除 -> 当前会失败
    try {
      await deleteSourceDocumentAction(testLedgerId, sourceDoc.id);
    } catch (_error) {
      // 当前行为：抛出错误，但用户看到的UI可能不一致
      // 记录已被软删除，但用户不知道
    }

    // 4. 【问题验证】查询活跃用户可见的记录
    const activeDocs = await db.query.sourceDocuments.findMany({
      where: and(
        eq(sourceDocuments.ledgerId, testLedgerId),
        isNull(sourceDocuments.deletedAt)  // 用户只能看到未软删除的记录
      ),
    });

    // 期望：用户看不到这条记录（因为它已被软删除）
    const foundDoc = activeDocs.find((d) => d.id === sourceDoc.id);

    // 修复前的问题：
    // - 如果删除失败，但记录已被软删除
    // - 用户刷新后可能看到也可能看不到这条记录（取决于查询条件）
    // - 这会导致用户困惑："删除失败"但记录不见了/还在

    // 验证：记录不应该在活跃用户列表中
    expect(foundDoc).toBeUndefined();
  });
});
