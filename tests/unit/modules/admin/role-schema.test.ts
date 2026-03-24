import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getTestDb } from "tests/setup";
import { users } from "@/persistence/schema/auth";

describe("admin role schema", () => {
  it("defaults new users to the user role", async () => {
    const db = getTestDb();
    const id = crypto.randomUUID();

    await db.insert(users).values({
      id,
      email: "role-default@example.com",
      emailVerified: new Date(),
    });

    const stored = await db.query.users.findFirst({
      where: eq(users.id, id),
    });

    expect(stored).toMatchObject({ role: "user" });
  });
});
