import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getTestDb } from "../../setup";
import { users } from "@/persistence/schema/auth";
import { changePassword } from "@/modules/auth/use-cases";
import { hashPassword, verifyPassword } from "@/modules/auth/services/password";
import { AUTH_ERROR_CODES } from "@/modules/auth/errors";

describe("changePassword use case", () => {
  const TEST_EMAIL = "change-password@example.com";
  let db: ReturnType<typeof getTestDb>;

  beforeEach(async () => {
    db = getTestDb();
    await db.delete(users).where(eq(users.email, TEST_EMAIL));
    const passwordHash = await hashPassword("OldPass123");
    await db.insert(users).values({ email: TEST_EMAIL, emailVerified: new Date(), passwordHash });
  });

  it("changes password with correct current password", async () => {
    const user = await db.query.users.findFirst({ where: eq(users.email, TEST_EMAIL) });
    expect(user).toBeDefined();
    if (!user) throw new Error("User not found");

    await changePassword({ userId: user.id, currentPassword: "OldPass123", newPassword: "NewPass456", confirmPassword: "NewPass456" });

    const updatedUser = await db.query.users.findFirst({ where: eq(users.id, user.id) });
    expect(updatedUser?.passwordHash).toBeDefined();
    const isOldValid = await verifyPassword("OldPass123", updatedUser?.passwordHash ?? "");
    expect(isOldValid).toBe(false);
    const isNewValid = await verifyPassword("NewPass456", updatedUser?.passwordHash ?? "");
    expect(isNewValid).toBe(true);
  });

  it("throws error when current password is wrong", async () => {
    const user = await db.query.users.findFirst({ where: eq(users.email, TEST_EMAIL) });
    expect(user).toBeDefined();
    if (!user) throw new Error("User not found");

    await expect(
      changePassword({ userId: user.id, currentPassword: "WrongPass123", newPassword: "NewPass456", confirmPassword: "NewPass456" })
    ).rejects.toMatchObject({ code: AUTH_ERROR_CODES.CURRENT_PASSWORD_WRONG });
  });

  it("throws error when new password does not match confirmation", async () => {
    const user = await db.query.users.findFirst({ where: eq(users.email, TEST_EMAIL) });
    expect(user).toBeDefined();
    if (!user) throw new Error("User not found");

    await expect(
      changePassword({ userId: user.id, currentPassword: "OldPass123", newPassword: "NewPass456", confirmPassword: "Different" })
    ).rejects.toMatchObject({ code: AUTH_ERROR_CODES.PASSWORD_MISMATCH });
  });

  it("throws error when new password is too short", async () => {
    const user = await db.query.users.findFirst({ where: eq(users.email, TEST_EMAIL) });
    expect(user).toBeDefined();
    if (!user) throw new Error("User not found");

    await expect(
      changePassword({ userId: user.id, currentPassword: "OldPass123", newPassword: "short1", confirmPassword: "short1" })
    ).rejects.toMatchObject({ code: AUTH_ERROR_CODES.PASSWORD_TOO_SHORT });
  });
});
