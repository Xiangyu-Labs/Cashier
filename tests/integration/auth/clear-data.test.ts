import { beforeEach, describe, expect, it } from "vitest";
import { eq, and, isNull } from "drizzle-orm";
import { getTestDb } from "../../setup";
import { users, ledgers } from "@/persistence";
import { clearUserData } from "@/modules/auth/use-cases";
import { ensureUserLedger } from "@/modules/workspace/use-cases";

describe("clearUserData use case", () => {
  let db: ReturnType<typeof getTestDb>;
  let userId: string;

  beforeEach(async () => {
    db = getTestDb();
    userId = "00000000-0000-0000-0000-000000000456";
    await db.delete(users).where(eq(users.id, userId));
    await db.insert(users).values({
      id: userId,
      email: "clear-data@example.com",
      emailVerified: new Date(),
    });
  });

  it("clears all user data but keeps the account", async () => {
    await ensureUserLedger({ userId });
    await clearUserData({ userId });

    const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
    expect(user).toBeDefined();
    expect(user?.deletedAt).toBeNull();

    const userLedgers = await db.query.ledgers.findMany({
      where: and(eq(ledgers.userId, userId), isNull(ledgers.deletedAt)),
    });
    expect(userLedgers).toHaveLength(0);
  });

  it("throws error for non-existent user", async () => {
    await expect(clearUserData({ userId: "non-existent-user-id" })).rejects.toBeInstanceOf(Error);
  });
});
