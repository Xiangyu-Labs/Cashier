import { describe, it, expect, beforeEach } from "vitest";
import { getTestDb } from "../../../setup";
import {
  createOTPToken,
  verifyOTPToken,
  isAccountLocked,
  deleteOTPToken,
  cleanupExpiredOTPTokens,
} from "@/lib/auth/otp-repository";
import { generateOTP, hashOTP } from "@/lib/auth/otp";
import { otpTokens } from "@/lib/db/schema";
import { sql } from "drizzle-orm";

describe("OTP Repository", () => {
  const testEmail = "otp-test@example.com";
  let db: ReturnType<typeof getTestDb>;

  beforeEach(async () => {
    db = getTestDb();
    // Clean OTP tokens before each test
    await db.execute(sql`TRUNCATE otp_tokens CASCADE`);
  });

  describe("createOTPToken", () => {
    it("should create a new OTP token", async () => {
      const otp = generateOTP();
      const result = await createOTPToken(testEmail, otp, "127.0.0.1");

      expect(result.success).toBe(true);
      expect(result.expiresAt).toBeInstanceOf(Date);

      // Verify token exists in database
      const tokens = await db.select().from(otpTokens);
      expect(tokens).toHaveLength(1);
      expect(tokens[0].email).toBe(testEmail.toLowerCase());
      expect(tokens[0].ipAddress).toBe("127.0.0.1");
    });

    it("should delete old OTP when creating new one", async () => {
      const otp1 = generateOTP();
      const otp2 = generateOTP();

      await createOTPToken(testEmail, otp1, "127.0.0.1");
      await createOTPToken(testEmail, otp2, "127.0.0.1");

      // Should only have one token
      const tokens = await db.select().from(otpTokens);
      expect(tokens).toHaveLength(1);

      // Should be the second OTP
      const isValid = await verifyOTPToken(testEmail, otp2);
      expect(isValid.success).toBe(true);
    });

    it("should normalize email to lowercase", async () => {
      const otp = generateOTP();
      await createOTPToken("Test@Example.COM", otp, "127.0.0.1");

      const tokens = await db.select().from(otpTokens);
      expect(tokens[0].email).toBe("test@example.com");
    });

    it("should store hashed OTP, not plain text", async () => {
      const otp = generateOTP();
      await createOTPToken(testEmail, otp, "127.0.0.1");

      const tokens = await db.select().from(otpTokens);
      expect(tokens[0].tokenHash).not.toBe(otp);
      expect(tokens[0].tokenHash).toBe(hashOTP(otp));
    });
  });

  describe("verifyOTPToken", () => {
    it("should verify correct OTP", async () => {
      const otp = generateOTP();
      await createOTPToken(testEmail, otp, "127.0.0.1");

      const result = await verifyOTPToken(testEmail, otp);

      expect(result.success).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it("should reject incorrect OTP", async () => {
      const otp = generateOTP();
      await createOTPToken(testEmail, otp, "127.0.0.1");

      const result = await verifyOTPToken(testEmail, "000000");

      expect(result.success).toBe(false);
      expect(result.reason).toBe("invalid");
      expect(result.attemptsRemaining).toBe(4); // 5 - 1 = 4
    });

    it("should increment attempts on failed verification", async () => {
      const otp = generateOTP();
      await createOTPToken(testEmail, otp, "127.0.0.1");

      await verifyOTPToken(testEmail, "000000");
      await verifyOTPToken(testEmail, "111111");
      const result = await verifyOTPToken(testEmail, "222222");

      expect(result.attemptsRemaining).toBe(2); // 5 - 3 = 2
    });

    it("should lock account after max attempts", async () => {
      const otp = generateOTP();
      await createOTPToken(testEmail, otp, "127.0.0.1");

      // Attempt 5 times with wrong OTP
      for (let i = 0; i < 4; i++) {
        await verifyOTPToken(testEmail, "000000");
      }

      const result = await verifyOTPToken(testEmail, "111111");

      expect(result.success).toBe(false);
      expect(result.reason).toBe("max_attempts");
      expect(result.attemptsRemaining).toBe(0);
      expect(result.lockedUntil).toBeInstanceOf(Date);
    });

    it("should reject verification when account is locked", async () => {
      const otp = generateOTP();
      await createOTPToken(testEmail, otp, "127.0.0.1");

      // Lock the account
      for (let i = 0; i < 5; i++) {
        await verifyOTPToken(testEmail, "000000");
      }

      // Try with correct OTP
      const result = await verifyOTPToken(testEmail, otp);

      expect(result.success).toBe(false);
      expect(result.reason).toBe("locked");
    });

    it("should reject expired OTP", async () => {
      const otp = generateOTP();
      await createOTPToken(testEmail, otp, "127.0.0.1");

      // Manually set expiration to past
      await db.execute(
        sql`UPDATE otp_tokens SET expires = NOW() - INTERVAL '1 hour' WHERE email = ${testEmail.toLowerCase()}`
      );

      const result = await verifyOTPToken(testEmail, otp);

      expect(result.success).toBe(false);
      expect(result.reason).toBe("expired");
    });

    it("should return not_found when no OTP exists", async () => {
      const result = await verifyOTPToken("nonexistent@example.com", "123456");

      expect(result.success).toBe(false);
      expect(result.reason).toBe("not_found");
    });

    it("should mark OTP as verified on success", async () => {
      const otp = generateOTP();
      await createOTPToken(testEmail, otp, "127.0.0.1");

      await verifyOTPToken(testEmail, otp);

      const tokens = await db.select().from(otpTokens);
      expect(tokens[0].verifiedAt).toBeInstanceOf(Date);
    });
  });

  describe("isAccountLocked", () => {
    it("should return false when no OTP exists", async () => {
      const result = await isAccountLocked("nonexistent@example.com");
      expect(result.locked).toBe(false);
    });

    it("should return false when account is not locked", async () => {
      const otp = generateOTP();
      await createOTPToken(testEmail, otp, "127.0.0.1");

      const result = await isAccountLocked(testEmail);
      expect(result.locked).toBe(false);
    });

    it("should return true when account is locked", async () => {
      const otp = generateOTP();
      await createOTPToken(testEmail, otp, "127.0.0.1");

      // Lock the account
      for (let i = 0; i < 5; i++) {
        await verifyOTPToken(testEmail, "000000");
      }

      const result = await isAccountLocked(testEmail);
      expect(result.locked).toBe(true);
      expect(result.lockedUntil).toBeInstanceOf(Date);
    });

    it("should return false when lockout has expired", async () => {
      const otp = generateOTP();
      await createOTPToken(testEmail, otp, "127.0.0.1");

      // Set lockout to past
      await db.execute(
        sql`UPDATE otp_tokens SET locked_until = NOW() - INTERVAL '1 hour' WHERE email = ${testEmail.toLowerCase()}`
      );

      const result = await isAccountLocked(testEmail);
      expect(result.locked).toBe(false);
    });
  });

  describe("deleteOTPToken", () => {
    it("should delete OTP token", async () => {
      const otp = generateOTP();
      await createOTPToken(testEmail, otp, "127.0.0.1");

      await deleteOTPToken(testEmail);

      const tokens = await db.select().from(otpTokens);
      expect(tokens).toHaveLength(0);
    });

    it("should not throw when deleting non-existent token", async () => {
      await expect(deleteOTPToken("nonexistent@example.com")).resolves.not.toThrow();
    });
  });

  describe("cleanupExpiredOTPTokens", () => {
    it("should delete expired tokens", async () => {
      const otp1 = generateOTP();
      const otp2 = generateOTP();

      await createOTPToken("user1@example.com", otp1, "127.0.0.1");
      await createOTPToken("user2@example.com", otp2, "127.0.0.1");

      // Expire first token
      await db.execute(
        sql`UPDATE otp_tokens SET expires = NOW() - INTERVAL '1 hour' WHERE email = 'user1@example.com'`
      );

      const deleted = await cleanupExpiredOTPTokens();

      expect(deleted).toBe(1);

      const tokens = await db.select().from(otpTokens);
      expect(tokens).toHaveLength(1);
      expect(tokens[0].email).toBe("user2@example.com");
    });

    it("should not delete valid tokens", async () => {
      const otp = generateOTP();
      await createOTPToken(testEmail, otp, "127.0.0.1");

      const deleted = await cleanupExpiredOTPTokens();

      expect(deleted).toBe(0);

      const tokens = await db.select().from(otpTokens);
      expect(tokens).toHaveLength(1);
    });
  });
});
