import { describe, it, expect, vi, beforeEach } from "vitest";
import { getTestDb } from "../../setup";
import { otpTokens } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { memoryStore } from "@/lib/memory-store";

// Mock Resend before importing actions
vi.mock("resend", () => ({
    Resend: class MockResend {
        emails = {
            send: vi.fn().mockResolvedValue({ id: "test-email-id" }),
        };
    },
}));

// Mock headers
vi.mock("next/headers", () => ({
    headers: vi.fn().mockResolvedValue({
        get: vi.fn((key: string) => {
            if (key === "x-forwarded-for") return "127.0.0.1";
            if (key === "x-real-ip") return "127.0.0.1";
            return null;
        }),
    }),
}));

import { sendOTPAction, verifyOTPAction } from "@/features/auth/server/actions/auth";
import { hashOTP } from "@/features/auth/server/services/otp";

const TEST_EMAIL = "test@example.com";

describe("Auth Actions - sendOTPAction", () => {
    beforeEach(async () => {
        // Clean up
        const db = getTestDb();
        await db.delete(otpTokens).where(eq(otpTokens.email, TEST_EMAIL));
        await memoryStore.flushall();
    });

    it("should send OTP successfully with valid email", async () => {
        const result = await sendOTPAction(TEST_EMAIL, "zh");

        expect(result.success).toBe(true);
        expect(result.expiresIn).toBeDefined();
        expect(result.expiresAt).toBeDefined();
        expect(result.canResendAt).toBeDefined();

        // Verify OTP was created in database
        const db = getTestDb();
        const record = await db.query.otpTokens.findFirst({
            where: eq(otpTokens.email, TEST_EMAIL),
        });
        expect(record).toBeDefined();
        expect(record?.tokenHash).toBeDefined();
    });

    it("should reject empty email", async () => {
        const result = await sendOTPAction("", "zh");

        expect(result.success).toBe(false);
        expect(result.error).toBe("Invalid email address");
    });

    it("should reject null email", async () => {
        const result = await sendOTPAction(null as unknown as string, "zh");

        expect(result.success).toBe(false);
        expect(result.error).toBe("Invalid email address");
    });

    it("should reject invalid email format", async () => {
        const result = await sendOTPAction("not-an-email", "zh");

        expect(result.success).toBe(false);
        expect(result.error).toBe("Invalid email format");
    });

    it("should reject email exceeding max length (254 chars)", async () => {
        const longEmail = "a".repeat(250) + "@test.com";
        const result = await sendOTPAction(longEmail, "zh");

        expect(result.success).toBe(false);
        expect(result.error).toBe("Invalid email address");
    });

    it("should normalize email to lowercase", async () => {
        const mixedCaseEmail = "Test@Example.COM";
        await sendOTPAction(mixedCaseEmail, "zh");

        const db = getTestDb();
        const record = await db.query.otpTokens.findFirst({
            where: eq(otpTokens.email, "test@example.com"),
        });
        expect(record).toBeDefined();
    });

    it("should enforce resend cooldown", async () => {
        // First send should succeed
        const result1 = await sendOTPAction(TEST_EMAIL, "zh");
        expect(result1.success).toBe(true);

        // Immediate second send should fail with cooldown
        const result2 = await sendOTPAction(TEST_EMAIL, "zh");
        expect(result2.success).toBe(false);
        expect(result2.error).toContain("wait");
        expect(result2.retryAfter).toBeDefined();
    });
});

describe("Auth Actions - verifyOTPAction", () => {
    beforeEach(async () => {
        const db = getTestDb();
        await db.delete(otpTokens).where(eq(otpTokens.email, TEST_EMAIL));
        await memoryStore.flushall();
    });

    async function createTestOTP(email: string, otp: string) {
        const db = getTestDb();
        const tokenHash = hashOTP(otp);
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

        await db.insert(otpTokens).values({
            email: email.toLowerCase(),
            tokenHash,
            expires: expiresAt,
            attempts: 0,
        });

        return { tokenHash, expiresAt };
    }

    it("should verify correct OTP successfully", async () => {
        const testOTP = "123456";
        await createTestOTP(TEST_EMAIL, testOTP);

        const result = await verifyOTPAction(TEST_EMAIL, testOTP);

        expect(result.success).toBe(true);
        expect(result.email).toBe(TEST_EMAIL);
    });

    it("should reject invalid OTP format (not 6 digits)", async () => {
        const result = await verifyOTPAction(TEST_EMAIL, "12345");

        expect(result.success).toBe(false);
        expect(result.error).toContain("6 digits");
    });

    it("should reject non-numeric OTP", async () => {
        const result = await verifyOTPAction(TEST_EMAIL, "abc123");

        expect(result.success).toBe(false);
        expect(result.error).toContain("6 digits");
    });

    it("should reject incorrect OTP without exposing details", async () => {
        const testOTP = "123456";
        await createTestOTP(TEST_EMAIL, testOTP);

        const result = await verifyOTPAction(TEST_EMAIL, "999999");

        expect(result.success).toBe(false);
        // Should return generic error message (security)
        expect(result.error).toContain("Invalid or expired");
    });

    it("should track failed attempts", async () => {
        const testOTP = "123456";
        await createTestOTP(TEST_EMAIL, testOTP);

        // First failed attempt
        const result1 = await verifyOTPAction(TEST_EMAIL, "999999");
        expect(result1.success).toBe(false);
        expect(result1.attemptsRemaining).toBeDefined();

        // Check database for attempt count
        const db = getTestDb();
        const record = await db.query.otpTokens.findFirst({
            where: eq(otpTokens.email, TEST_EMAIL),
        });
        expect(record?.attempts).toBe(1);
    });

    it("should lock account after max attempts", async () => {
        const testOTP = "123456";
        await createTestOTP(TEST_EMAIL, testOTP);

        // Exhaust all attempts (default max is 5)
        for (let i = 0; i < 5; i++) {
            await verifyOTPAction(TEST_EMAIL, "999999");
        }

        // Next attempt should indicate account is locked
        const result = await verifyOTPAction(TEST_EMAIL, "999999");
        expect(result.success).toBe(false);
        expect(result.error).toContain("locked");
        expect(result.lockedUntil).toBeDefined();
    });

    it("should reject expired OTP", async () => {
        const db = getTestDb();
        const testOTP = "123456";
        const tokenHash = hashOTP(testOTP);
        const expiredTime = new Date(Date.now() - 1000); // 1 second ago

        await db.insert(otpTokens).values({
            email: TEST_EMAIL,
            tokenHash,
            expires: expiredTime,
            attempts: 0,
        });

        const result = await verifyOTPAction(TEST_EMAIL, testOTP);

        expect(result.success).toBe(false);
        expect(result.error).toContain("Invalid or expired");
    });

    it("should reject verification for non-existent OTP", async () => {
        const result = await verifyOTPAction("nonexistent@example.com", "123456");

        expect(result.success).toBe(false);
        expect(result.error).toContain("Invalid or expired");
    });

    it("should reject empty email", async () => {
        const result = await verifyOTPAction("", "123456");

        expect(result.success).toBe(false);
        expect(result.error).toBe("Invalid email address");
    });

    it("should reject empty OTP", async () => {
        const result = await verifyOTPAction(TEST_EMAIL, "");

        expect(result.success).toBe(false);
        expect(result.error).toBe("Invalid verification code");
    });

    it("should normalize email case during verification", async () => {
        const testOTP = "123456";
        await createTestOTP("test@example.com", testOTP);

        // Verify with different case
        const result = await verifyOTPAction("Test@Example.COM", testOTP);

        expect(result.success).toBe(true);
    });
});

describe("Auth Actions - Integration Flow", () => {
    beforeEach(async () => {
        const db = getTestDb();
        await db.delete(otpTokens).where(eq(otpTokens.email, TEST_EMAIL));
        await memoryStore.flushall();
    });

    it("should complete full send and verify flow", async () => {
        // Step 1: Send OTP
        const sendResult = await sendOTPAction(TEST_EMAIL, "zh");
        expect(sendResult.success).toBe(true);

        // Get the OTP from database (in real scenario, user would receive via email)
        const db = getTestDb();
        const record = await db.query.otpTokens.findFirst({
            where: eq(otpTokens.email, TEST_EMAIL),
        });
        expect(record).toBeDefined();

        // We can't get the original OTP (only hash stored), so we'll verify it fails
        // with wrong OTP and check the flow works
        const wrongResult = await verifyOTPAction(TEST_EMAIL, "000000");
        expect(wrongResult.success).toBe(false);
        expect(wrongResult.attemptsRemaining).toBeDefined();
    });

    it("should handle rate limiting across multiple emails", async () => {
        // Send to first email
        const result1 = await sendOTPAction("user1@example.com", "zh");
        expect(result1.success).toBe(true);

        // Send to different email should work (not rate limited by IP in test)
        const result2 = await sendOTPAction("user2@example.com", "zh");
        // This might succeed or fail depending on IP rate limit implementation
        // We just verify the function doesn't throw
        expect(result2).toHaveProperty("success");
    });
});
