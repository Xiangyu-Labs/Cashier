import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { ledgers, users } from "@/persistence";
import { eq } from "drizzle-orm";

async function createTestUser(email?: string) {
  const id = crypto.randomUUID();
  const [user] = await db
    .insert(users)
    .values({
      id,
      email: email ?? `test-${id}@example.com`,
      name: "Test User",
      emailVerified: new Date(),
    })
    .returning();
  expect(user).toBeDefined();
  if (user === undefined) {
    throw new Error("Expected user insert to return a row");
  }
  return user;
}

describe("Ledger single limit constraint", () => {
  beforeEach(async () => {
    // Clean up test data - use raw SQL for cleanup to avoid relation issues
    await db.delete(ledgers).where(eq(ledgers.id, "ledger-test-1"));
    await db.delete(ledgers).where(eq(ledgers.id, "ledger-test-2"));
  });

  it("should allow creating first ledger for user", async () => {
    const user = await createTestUser();

    // 创建第一个账本
    const [ledger] = await db
      .insert(ledgers)
      .values({
        id: "ledger-test-1",
        userId: user.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    expect(ledger).toBeDefined();
    expect(ledger?.userId).toBe(user.id);
  });

  it("should prevent creating second ledger for same user", async () => {
    const user = await createTestUser();

    // 创建第一个账本
    await db.insert(ledgers).values({
      id: "ledger-test-1",
      userId: user.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // 尝试创建第二个账本应该失败
    await expect(
      db.insert(ledgers).values({
        id: "ledger-test-2",
        userId: user.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    ).rejects.toThrow();
  });

  it("should allow different users to each have one ledger", async () => {
    const user1 = await createTestUser("user1@test.com");
    const user2 = await createTestUser("user2@test.com");

    // 用户1创建账本
    const [ledger1] = await db
      .insert(ledgers)
      .values({
        id: "ledger-test-1",
        userId: user1.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    // 用户2创建账本
    const [ledger2] = await db
      .insert(ledgers)
      .values({
        id: "ledger-test-2",
        userId: user2.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    expect(ledger1).toBeDefined();
    expect(ledger2).toBeDefined();
    expect(ledger1?.userId).toBe(user1.id);
    expect(ledger2?.userId).toBe(user2.id);
  });
});
