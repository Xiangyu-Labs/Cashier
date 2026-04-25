import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getTestDb } from "../../setup";
import { users } from "@/persistence/schema/auth";
import { setPassword } from "@/modules/auth/use-cases";
import { verifyPassword } from "@/modules/auth/services/password";
import { AUTH_ERROR_CODES } from "@/modules/auth/errors";

describe("setPassword use case", () => {
  const TEST_EMAIL = "set-password@example.com";
  let db: ReturnType<typeof getTestDb>;

  beforeEach(async () => {
    db = getTestDb();
    await db.delete(users).where(eq(users.email, TEST_EMAIL));
    await db.insert(users).values({ email: TEST_EMAIL, emailVerified: new Date() });
  });

  it("sets password for user without existing password", async () => {
    const user = await db.query.users.findFirst({ where: eq(users.email, TEST_EMAIL) });
    expect(user).toBeDefined();
    if (!user) throw new Error("User not found");

    await setPassword({ userId: user.id, newPassword: "NewPass123", confirmPassword: "NewPass123" });

    const updatedUser = await db.query.users.findFirst({ where: eq(users.id, user.id) });
    expect(updatedUser?.passwordHash).toBeDefined();
    expect(updatedUser?.passwordHash).not.toBeNull();
    const isValid = await verifyPassword("NewPass123", updatedUser?.passwordHash ?? "");
    expect(isValid).toBe(true);
  });

  it("throws error when passwords do not match", async () => {
    const user = await db.query.users.findFirst({ where: eq(users.email, TEST_EMAIL) });
    expect(user).toBeDefined();
    if (!user) throw new Error("User not found");

    await expect(
      setPassword({ userId: user.id, newPassword: "NewPass123", confirmPassword: "Different" })
    ).rejects.toMatchObject({ code: AUTH_ERROR_CODES.PASSWORD_MISMATCH });
  });

  it("throws error when password is too short", async () => {
    const user = await db.query.users.findFirst({ where: eq(users.email, TEST_EMAIL) });
    expect(user).toBeDefined();
    if (!user) throw new Error("User not found");

    await expect(
      setPassword({ userId: user.id, newPassword: "short1", confirmPassword: "short1" })
    ).rejects.toMatchObject({ code: AUTH_ERROR_CODES.PASSWORD_TOO_SHORT });
  });

  it("throws error when password does not meet requirements", async () => {
    const user = await db.query.users.findFirst({ where: eq(users.email, TEST_EMAIL) });
    expect(user).toBeDefined();
    if (!user) throw new Error("User not found");

    await expect(
      setPassword({ userId: user.id, newPassword: "onlyletters", confirmPassword: "onlyletters" })
    ).rejects.toMatchObject({ code: AUTH_ERROR_CODES.PASSWORD_REQUIREMENTS_NOT_MET });
  });
});
