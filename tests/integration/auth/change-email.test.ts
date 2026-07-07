import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getTestDb } from "../../setup";
import { users, otpTokens } from "@/persistence/schema/auth";
import { changeEmail } from "@/modules/auth/application/use-cases/change-email";
import { hashOTP } from "@/modules/auth/services/otp";
import { AUTH_ERROR_CODES } from "@/modules/auth/errors";

describe("changeEmail use case", () => {
  const OLD_EMAIL = "old-email@example.com";
  const NEW_EMAIL = "new-email@example.com";
  let db: ReturnType<typeof getTestDb>;

  beforeEach(async () => {
    db = getTestDb();
    await db.delete(users).where(eq(users.email, OLD_EMAIL));
    await db.delete(users).where(eq(users.email, NEW_EMAIL));
    await db.insert(users).values({ email: OLD_EMAIL, emailVerified: new Date() });
  });

  async function createTestOTP(email: string, otp: string) {
    await db.insert(otpTokens).values({
      email: email.toLowerCase(),
      tokenHash: hashOTP(otp),
      expires: new Date(Date.now() + 5 * 60 * 1000),
      attempts: 0,
    });
  }

  it("changes email with valid OTP", async () => {
    const user = await db.query.users.findFirst({ where: eq(users.email, OLD_EMAIL) });
    expect(user).toBeDefined();
    if (!user) throw new Error("User not found");

    await createTestOTP(NEW_EMAIL, "123456");
    await changeEmail({ userId: user.id, newEmail: NEW_EMAIL, otp: "123456" });

    const updatedUser = await db.query.users.findFirst({ where: eq(users.id, user.id) });
    expect(updatedUser?.email).toBe(NEW_EMAIL);
  });

  it("throws error when OTP is invalid", async () => {
    const user = await db.query.users.findFirst({ where: eq(users.email, OLD_EMAIL) });
    expect(user).toBeDefined();
    if (!user) throw new Error("User not found");

    await createTestOTP(NEW_EMAIL, "123456");
    await expect(
      changeEmail({ userId: user.id, newEmail: NEW_EMAIL, otp: "999999" })
    ).rejects.toMatchObject({ code: AUTH_ERROR_CODES.OTP_INVALID_FOR_ACTION });
  });

  it("throws error when new email already exists", async () => {
    await db.insert(users).values({ email: NEW_EMAIL, emailVerified: new Date() });
    const user = await db.query.users.findFirst({ where: eq(users.email, OLD_EMAIL) });
    expect(user).toBeDefined();
    if (!user) throw new Error("User not found");

    await createTestOTP(NEW_EMAIL, "123456");
    await expect(
      changeEmail({ userId: user.id, newEmail: NEW_EMAIL, otp: "123456" })
    ).rejects.toMatchObject({ code: AUTH_ERROR_CODES.EMAIL_ALREADY_EXISTS });
  });

  it("throws error when OTP record not found", async () => {
    const user = await db.query.users.findFirst({ where: eq(users.email, OLD_EMAIL) });
    expect(user).toBeDefined();
    if (!user) throw new Error("User not found");

    await expect(
      changeEmail({ userId: user.id, newEmail: NEW_EMAIL, otp: "123456" })
    ).rejects.toMatchObject({ code: AUTH_ERROR_CODES.OTP_INVALID_FOR_ACTION });
  });
});
