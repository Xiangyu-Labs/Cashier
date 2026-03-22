import { beforeEach, describe, expect, it, vi } from "vitest";
import { AUTH_ERROR_CODES } from "@/modules/auth/errors";

const {
  findOTPRecordMock,
  verifyOTPWithPolicyMock,
  checkVerifyRateLimitMock,
  deleteOTPTokenMock,
  ensureUserLedgerMock,
  assertRegistrationAllowedMock,
  getClientIPFromHeadersMock,
  dbUserFindFirstMock,
  dbInsertValuesMock,
  dbInsertReturningMock,
  loggerWarnMock,
} = vi.hoisted(() => ({
  findOTPRecordMock: vi.fn(),
  verifyOTPWithPolicyMock: vi.fn(),
  checkVerifyRateLimitMock: vi.fn(),
  deleteOTPTokenMock: vi.fn(),
  ensureUserLedgerMock: vi.fn(),
  assertRegistrationAllowedMock: vi.fn(),
  getClientIPFromHeadersMock: vi.fn(),
  dbUserFindFirstMock: vi.fn(),
  dbInsertValuesMock: vi.fn(),
  dbInsertReturningMock: vi.fn(),
  loggerWarnMock: vi.fn(),
}));

vi.mock("@/modules/auth/services/otp-verification", () => ({
  findOTPRecord: findOTPRecordMock,
  verifyOTPWithPolicy: verifyOTPWithPolicyMock,
}));

vi.mock("@/modules/auth/services/otp-rate-limit", () => ({
  checkVerifyRateLimit: checkVerifyRateLimitMock,
}));

vi.mock("@/modules/auth/repositories/otp-repository", () => ({
  deleteOTPToken: deleteOTPTokenMock,
}));

vi.mock("@/modules/workspace/use-cases", () => ({
  ensureUserLedger: ensureUserLedgerMock,
}));

vi.mock("@/modules/auth/application/use-cases/registration-policy", () => ({
  assertRegistrationAllowed: assertRegistrationAllowedMock,
}));

vi.mock("@/lib/utils/ip", () => ({
  getClientIPFromHeaders: getClientIPFromHeadersMock,
}));

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      users: {
        findFirst: dbUserFindFirstMock,
      },
    },
    insert: vi.fn(() => ({
      values: dbInsertValuesMock,
    })),
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    warn: loggerWarnMock,
    debug: vi.fn(),
    child: vi.fn(() => ({
      warn: loggerWarnMock,
      debug: vi.fn(),
    })),
  },
}));

import {
  authenticateWithOTP,
  OTPInvalidSignInError,
  OTPLockedSignInError,
  OTPRateLimitedSignInError,
} from "../../../../../src/modules/auth/application/use-cases/authenticate-with-otp";

describe("authenticateWithOTP additional coverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    findOTPRecordMock.mockResolvedValue({
      id: "otp-id",
      email: "new-user@example.com",
      tokenHash: "hash",
      expires: new Date(Date.now() + 60_000),
      attempts: 0,
      createdAt: new Date(),
      lastAttemptAt: null,
      lockedUntil: null,
      verifiedAt: null,
      ipAddress: "127.0.0.1",
    });
    checkVerifyRateLimitMock.mockResolvedValue(true);
    verifyOTPWithPolicyMock.mockResolvedValue({ success: true });
    assertRegistrationAllowedMock.mockResolvedValue(undefined);
    dbUserFindFirstMock.mockResolvedValue(null);
    dbInsertReturningMock.mockResolvedValue([
      {
        id: "new-user-id",
        email: "new-user@example.com",
        name: null,
        image: null,
      },
    ]);
    dbInsertValuesMock.mockReturnValue({
      returning: dbInsertReturningMock,
    });
    deleteOTPTokenMock.mockResolvedValue(undefined);
    ensureUserLedgerMock.mockResolvedValue({
      ledgerId: "new-ledger-id",
      created: true,
    });
    getClientIPFromHeadersMock.mockReturnValue("127.0.0.1");
  });

  it("creates user and ledger for first sign-in and defaults locale to zh", async () => {
    const result = await authenticateWithOTP({
      email: "NEW-USER@EXAMPLE.COM",
      otp: "123456",
      requestHeaders: new Headers(),
    });

    expect(assertRegistrationAllowedMock).toHaveBeenCalledWith("new-user@example.com");
    expect(ensureUserLedgerMock).toHaveBeenCalledWith({
      userId: "new-user-id",
      locale: "zh",
    });
    expect(deleteOTPTokenMock).toHaveBeenCalledWith("new-user@example.com");
    expect(result).toEqual({
      id: "new-user-id",
      email: "new-user@example.com",
      name: null,
      image: null,
    });
  });

  it("throws otp_invalid when OTP record is missing", async () => {
    findOTPRecordMock.mockResolvedValueOnce(null);

    await expect(
      authenticateWithOTP({
        email: "missing@example.com",
        otp: "123456",
        requestHeaders: new Headers(),
      })
    ).rejects.toBeInstanceOf(OTPInvalidSignInError);
  });

  it("throws otp_rate_limited when verify rate-limit denies request", async () => {
    checkVerifyRateLimitMock.mockResolvedValueOnce(false);

    await expect(
      authenticateWithOTP({
        email: "new-user@example.com",
        otp: "123456",
        requestHeaders: new Headers(),
      })
    ).rejects.toBeInstanceOf(OTPRateLimitedSignInError);

    expect(verifyOTPWithPolicyMock).not.toHaveBeenCalled();
  });

  it("maps max_attempts result to otp_locked", async () => {
    verifyOTPWithPolicyMock.mockResolvedValueOnce({
      success: false,
      reason: "max_attempts",
      attemptsRemaining: 0,
    });

    await expect(
      authenticateWithOTP({
        email: "new-user@example.com",
        otp: "000000",
        requestHeaders: new Headers(),
      })
    ).rejects.toBeInstanceOf(OTPLockedSignInError);
  });

  it("throws otp_invalid for malformed OTP format", async () => {
    await expect(
      authenticateWithOTP({
        email: "new-user@example.com",
        otp: "abc",
        requestHeaders: new Headers(),
      })
    ).rejects.toMatchObject({ code: AUTH_ERROR_CODES.OTP_INVALID });
  });
});
