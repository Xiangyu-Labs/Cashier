import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getTestDb } from "../../setup";
import { users } from "@/persistence/schema/auth";
import { authenticateWithPassword } from "@/modules/auth/use-cases";
import { hashPassword } from "@/modules/auth/services/password";
import { AUTH_ERROR_CODES } from "@/modules/auth/errors";

describe("authenticateWithPassword", () => {
  const TEST_EMAIL = "password-user@example.com";
  let db: ReturnType<typeof getTestDb>;

  beforeEach(async () => {
    db = getTestDb();
    await db.delete(users).where(eq(users.email, TEST_EMAIL));
  });

  async function createUserWithPassword(email: string, password: string) {
    const passwordHash = await hashPassword(password);
    await db.insert(users).values({
      email,
      emailVerified: new Date(),
      passwordHash,
    });
  }

  it("signs in successfully with valid credentials", async () => {
    await createUserWithPassword(TEST_EMAIL, "ValidPass123");
    const result = await authenticateWithPassword({
      email: TEST_EMAIL,
      password: "ValidPass123",
    });
    expect(result).toMatchObject({ email: TEST_EMAIL });
    expect(result.id).toBeDefined();
  });

  it("throws invalid_credentials for wrong password", async () => {
    await createUserWithPassword(TEST_EMAIL, "ValidPass123");
    await expect(
      authenticateWithPassword({ email: TEST_EMAIL, password: "WrongPass123" })
    ).rejects.toMatchObject({ code: AUTH_ERROR_CODES.INVALID_CREDENTIALS });
  });

  it("throws invalid_credentials for non-existent user", async () => {
    await expect(
      authenticateWithPassword({ email: "nonexistent@example.com", password: "AnyPass123" })
    ).rejects.toMatchObject({ code: AUTH_ERROR_CODES.INVALID_CREDENTIALS });
  });

  it("throws invalid_credentials for user without password", async () => {
    await db.insert(users).values({ email: TEST_EMAIL, emailVerified: new Date() });
    await expect(
      authenticateWithPassword({ email: TEST_EMAIL, password: "AnyPass123" })
    ).rejects.toMatchObject({ code: AUTH_ERROR_CODES.INVALID_CREDENTIALS });
  });
});
