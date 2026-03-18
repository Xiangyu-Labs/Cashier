import { describe, it, expect, beforeEach, vi } from "vitest";
import { deleteLedgerAction } from "@/features/ledger/server/actions/delete";
import { getTestDb } from "../../setup";
import { ledgers, entryCategories, sourceDocuments, ledgerEntries } from "@/persistence";
import { eq } from "drizzle-orm";
import { createTestUserWithLedger, TEST_USER_ID } from "../../helpers/schema-setup";
import { auth } from "@/auth";

// Mock next/cache
vi.mock("next/cache", () => ({
  updateTag: vi.fn(),
}));

// Mock auth module
vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

/**
 * 删除账本的幂等性测试
 *
 * 问题场景：竞态条件导致删除已软删除的账本时抛出 NotFoundError
 *
 * 正确行为：删除应该是幂等的 - 多次删除同一条记录应该成功（或至少不抛错）
 */
describe("Ledger Delete Idempotency", () => {
  beforeEach(async () => {
    const db = getTestDb();
    // 清理所有测试数据
    await db.delete(ledgerEntries);
    await db.delete(sourceDocuments);
    await db.delete(entryCategories);
    await db.delete(ledgers);

    // Setup auth mock for each test
    vi.mocked(auth as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: TEST_USER_ID, email: "test@example.com" },
      expires: new Date(Date.now() + 3600 * 1000).toISOString(),
    });
  });

  it("应该允许重复删除同一个账本（幂等性）", async () => {
    const db = getTestDb();

    // 1. 创建账本
    const { ledgerId } = await createTestUserWithLedger(db, undefined, "待删除的账本", TEST_USER_ID);

    // 2. 第一次删除 - 应该成功（withAuth 从 session 提取 userId，只传 ledgerId）
    await expect(
      deleteLedgerAction(ledgerId)
    ).resolves.not.toThrow();

    // 3. 【问题】第二次删除同同一个账本（模拟竞态条件或重复点击）
    // 当前行为：抛出 NotFoundError ❌
    // 期望行为：应该成功（幂等）✅
    await expect(
      deleteLedgerAction(ledgerId)
    ).resolves.not.toThrow();  // 修复后这行应该通过

    // 4. 验证账本被软删除
    const deletedLedger = await db.query.ledgers.findFirst({
      where: eq(ledgers.id, ledgerId),
    });
    expect(deletedLedger?.deletedAt).not.toBeNull();
  });

  it("删除已软删除的账本应该静默成功，而不是抛出错误", async () => {
    const db = getTestDb();

    // 1. 创建并软删除账本（模拟后台进程或之前的删除操作）
    const { ledgerId } = await createTestUserWithLedger(db, undefined, "已被后台软删除的账本", TEST_USER_ID);

    // 2. 【模拟竞态条件】后台进程软删除了账本
    await db
      .update(ledgers)
      .set({ deletedAt: new Date() })
      .where(eq(ledgers.id, ledgerId));

    // 3. 用户尝试删除这个"已不存在"的账本
    // 当前行为：抛出 NotFoundError，用户看到"删除失败" ❌
    // 期望行为：静默成功，因为目标状态（已删除）已经达成 ✅
    await expect(
      deleteLedgerAction(ledgerId)
    ).resolves.toBeUndefined();  // 修复后应该返回 undefined（成功）

    // 4. 验证账本仍然被软删除（状态未改变）
    const ledger = await db.query.ledgers.findFirst({
      where: eq(ledgers.id, ledgerId),
    });
    expect(ledger?.deletedAt).not.toBeNull();
  });

  it("并发删除同一个账本应该都能成功", async () => {
    const db = getTestDb();

    // 1. 创建账本
    const { ledgerId } = await createTestUserWithLedger(db, undefined, "并发删除测试账本", TEST_USER_ID);

    // 2. 模拟两个并发的删除请求
    const delete1 = deleteLedgerAction(ledgerId);
    const delete2 = deleteLedgerAction(ledgerId);

    // 两个请求都应该成功（不抛出错误）
    const [result1, result2] = await Promise.allSettled([delete1, delete2]);

    // 期望：两个都成功（fulfilled）
    expect(result1.status).toBe("fulfilled");
    expect(result2.status).toBe("fulfilled");  // 修复后这行应该通过

    // 验证账本被软删除
    const ledger = await db.query.ledgers.findFirst({
      where: eq(ledgers.id, ledgerId),
    });
    expect(ledger?.deletedAt).not.toBeNull();
  });

  it("删除不存在的账本应该抛出 NotFoundError（新建账本的情况）", async () => {
    // 这个测试验证：真正不存在的账本（新创建的ID）仍然应该报错
    // 这是正确的行为 - 不存在的资源应该报错

    const fakeLedgerId = "00000000-0000-0000-0000-000000000000";

    await expect(
      deleteLedgerAction(fakeLedgerId)
    ).rejects.toThrow("Ledger");
  });
});
