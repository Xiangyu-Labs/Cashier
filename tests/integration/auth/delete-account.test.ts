import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getTestDb } from "../../setup";
import { users } from "@/persistence/schema/auth";
import { deleteAccount } from "@/modules/auth/use-cases";

describe("deleteAccount use case", () => {
  const userId = "00000000-0000-0000-0000-000000000123";
  let db: ReturnType<typeof getTestDb>;

  beforeEach(async () => {
    db = getTestDb();
    await db.delete(users).where(eq(users.id, userId));
    await db.insert(users).values({
      id: userId,
      email: "delete-account@example.com",
      emailVerified: new Date(),
      name: "Delete Account User",
    });
  });

  it("soft deletes the specified user account", async () => {
    await deleteAccount(userId);

    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    expect(user?.deletedAt).toBeInstanceOf(Date);
  });
});
