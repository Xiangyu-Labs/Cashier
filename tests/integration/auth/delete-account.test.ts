import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getTestDb } from "../../setup";
import { users, otpTokens } from "@/persistence/schema/auth";
import { deleteAccount } from "@/modules/auth/application/use-cases/delete-account";
import { hashOTP } from "@/modules/auth/services/otp";
import { AUTH_ERROR_CODES } from "@/modules/auth/errors";

describe("deleteAccount use case", () => {
  const userId = "00000000-0000-0000-0000-000000000123";
  const email = "delete-account@example.com";
  let db: ReturnType<typeof getTestDb>;

  beforeEach(async () => {
    db = getTestDb();
    await db.delete(users).where(eq(users.id, userId));
    await db.delete(otpTokens).where(eq(otpTokens.email, email));
    await db.insert(users).values({
      id: userId,
      email,
      emailVerified: new Date(),
      name: "Delete Account User",
    });
  });

  async function createTestOTP(otpEmail: string, otp: string) {
    await db.insert(otpTokens).values({
      email: otpEmail.toLowerCase(),
      tokenHash: hashOTP(otp),
      expires: new Date(Date.now() + 5 * 60 * 1000),
      attempts: 0,
    });
  }

  it("soft deletes the specified user account with valid OTP", async () => {
    await createTestOTP(email, "123456");
    await deleteAccount({ userId, email, otp: "123456" });

    const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
    expect(user?.deletedAt).toBeInstanceOf(Date);
  });

  it("throws error when OTP is invalid", async () => {
    await createTestOTP(email, "123456");
    await expect(
      deleteAccount({ userId, email, otp: "999999" })
    ).rejects.toMatchObject({ code: AUTH_ERROR_CODES.OTP_INVALID_FOR_ACTION });
  });

  it("throws error when OTP record not found", async () => {
    await expect(
      deleteAccount({ userId, email, otp: "123456" })
    ).rejects.toMatchObject({ code: AUTH_ERROR_CODES.OTP_INVALID_FOR_ACTION });
  });
});
