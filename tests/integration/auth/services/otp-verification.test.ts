import { describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getTestDb } from "tests/setup";
import { otpTokens } from "@/persistence/schema/auth";
import { hashOTP } from "@/modules/auth/services/otp";
import { db } from "@/lib/db";
import {
  findOTPRecord as findOTPRecordWithPort,
  isAccountLocked as isAccountLockedWithPort,
} from "@/modules/auth/services/otp-verification";
import { serverComposition } from "@/application/server-composition-root";

const findOTPRecord = (email: string) => findOTPRecordWithPort(email, serverComposition.otpTokens);
const isAccountLocked = (email: string) =>
  isAccountLockedWithPort(email, serverComposition.otpTokens);

describe("otp-verification service", () => {
  it("findOTPRecord is case-insensitive for email input", async () => {
    const testDb = getTestDb();
    const email = "otp-case@example.com";
    const tokenHash = hashOTP("123456");

    await testDb.insert(otpTokens).values({
      email,
      tokenHash,
      expires: new Date(Date.now() + 60_000),
      attempts: 0,
    });

    const record = await findOTPRecord("OTP-CASE@EXAMPLE.COM");
    expect(record).toBeDefined();
    expect(record?.email).toBe(email);
  });

  it("returns locked true with lockedUntil when lock is active", async () => {
    const testDb = getTestDb();
    const email = "locked-user@example.com";

    await testDb.insert(otpTokens).values({
      email,
      tokenHash: hashOTP("123456"),
      expires: new Date(Date.now() + 60_000),
      attempts: 5,
      lockedUntil: new Date(Date.now() + 60_000),
    });

    const result = await isAccountLocked(email);
    expect(result.locked).toBe(true);
    expect(result.lockedUntil).toBeInstanceOf(Date);
  });

  it("fails open when lock-status query throws", async () => {
    const originalSelect = (db as unknown as { select: unknown }).select;
    (db as unknown as { select: unknown }).select = vi.fn(() => {
      throw new Error("db unavailable");
    });

    try {
      const result = await isAccountLocked("anyone@example.com");
      expect(result).toEqual({ locked: false });
    } finally {
      (db as unknown as { select: unknown }).select = originalSelect;
    }
  });

  it("returns unlocked when lockout has expired", async () => {
    const testDb = getTestDb();
    const email = "expired-lock@example.com";

    await testDb.insert(otpTokens).values({
      email,
      tokenHash: hashOTP("123456"),
      expires: new Date(Date.now() + 60_000),
      attempts: 5,
      lockedUntil: new Date(Date.now() - 60_000),
    });

    const result = await isAccountLocked(email);
    expect(result).toEqual({ locked: false });
  });

  it("findOTPRecord returns undefined when record does not exist", async () => {
    const testDb = getTestDb();
    const missingEmail = "missing@example.com";
    const existing = await testDb.query.otpTokens.findFirst({
      where: eq(otpTokens.email, missingEmail),
    });
    expect(existing).toBeUndefined();

    await expect(findOTPRecord(missingEmail)).resolves.toBeUndefined();
  });
});
