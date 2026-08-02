import { beforeEach, describe, expect, it, vi } from "vitest";
import { AUTH_ERROR_CODES } from "@/modules/auth/errors";
import type { LedgerPort, OtpTokenPort, UserAccountPort } from "@/application/contracts";

const {
  findOTPRecordMock,
  verifyOTPWithPolicyMock,
  consumeOTPClaimMock,
  releaseOTPClaimMock,
  checkVerifyRateLimitMock,
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
  consumeOTPClaimMock: vi.fn(),
  releaseOTPClaimMock: vi.fn(),
  checkVerifyRateLimitMock: vi.fn(),
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
  consumeOTPClaim: consumeOTPClaimMock,
  releaseOTPClaim: releaseOTPClaimMock,
}));

vi.mock("@/modules/auth/services/otp-rate-limit", () => ({
  checkVerifyRateLimit: checkVerifyRateLimitMock,
}));

vi.mock("@/modules/workspace/application/use-cases/ensure-user-ledger", () => ({
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
  authenticateWithOTP as authenticateWithOTPUseCase,
  OTPInvalidSignInError,
  OTPLockedSignInError,
  OTPRateLimitedSignInError,
} from "@/modules/auth/application/use-cases/authenticate-with-otp";

const otpTokens = {} as OtpTokenPort;
const ledgers = {} as LedgerPort;
const fallbackUsers = {} as UserAccountPort;
const rateLimiter = {} as import("@/modules/auth/application/ports").RateLimitPort;
const authenticateWithOTP = (
  input: Parameters<typeof authenticateWithOTPUseCase>[0],
  users: UserAccountPort = fallbackUsers
) => authenticateWithOTPUseCase(input, { userAccounts: users, otpTokens, ledgers, rateLimiter });

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
    consumeOTPClaimMock.mockResolvedValue(true);
    releaseOTPClaimMock.mockResolvedValue(undefined);
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
    ensureUserLedgerMock.mockResolvedValue({
      ledgerId: "new-ledger-id",
      created: true,
    });
    getClientIPFromHeadersMock.mockReturnValue("127.0.0.1");
  });

  it("creates user and ledger for first sign-in and defaults locale to zh", async () => {
    const users = {
      findOrCreate: vi.fn().mockResolvedValue({
        user: {
          id: "new-user-id",
          email: "new-user@example.com",
          name: null,
          image: null,
        },
        isExistingUser: false,
      }),
    } as unknown as UserAccountPort;
    const result = await authenticateWithOTP(
      {
        email: "NEW-USER@EXAMPLE.COM",
        otp: "123456",
        requestHeaders: new Headers(),
      },
      users
    );

    expect(assertRegistrationAllowedMock).toHaveBeenCalledWith("new-user@example.com", users);
    expect(ensureUserLedgerMock).toHaveBeenCalledWith(
      { userId: "new-user-id", locale: "zh" },
      ledgers
    );
    expect(result).toEqual({
      id: "new-user-id",
      email: "new-user@example.com",
      name: null,
      image: null,
      locale: "zh",
    });
    expect(consumeOTPClaimMock).toHaveBeenCalledWith(
      { email: "new-user@example.com", tokenHash: "hash" },
      otpTokens
    );
  });

  it("ensures a ledger for an existing user before consuming the OTP", async () => {
    const users = {
      findOrCreate: vi.fn().mockResolvedValue({
        user: {
          id: "existing-user-id",
          email: "new-user@example.com",
          name: null,
          image: null,
        },
        isExistingUser: true,
      }),
    } as unknown as UserAccountPort;

    await authenticateWithOTP(
      { email: "new-user@example.com", otp: "123456", requestHeaders: new Headers() },
      users
    );

    expect(ensureUserLedgerMock).toHaveBeenCalledWith(
      { userId: "existing-user-id", locale: "zh" },
      ledgers
    );
    expect(consumeOTPClaimMock).toHaveBeenCalledOnce();
  });

  it("releases the OTP claim when account setup fails", async () => {
    const setupError = new Error("ledger unavailable");
    ensureUserLedgerMock.mockRejectedValueOnce(setupError);
    const users = {
      findOrCreate: vi.fn().mockResolvedValue({
        user: {
          id: "new-user-id",
          email: "new-user@example.com",
          name: null,
          image: null,
        },
        isExistingUser: false,
      }),
    } as unknown as UserAccountPort;

    await expect(
      authenticateWithOTP(
        { email: "new-user@example.com", otp: "123456", requestHeaders: new Headers() },
        users
      )
    ).rejects.toBe(setupError);

    expect(consumeOTPClaimMock).not.toHaveBeenCalled();
    expect(releaseOTPClaimMock).toHaveBeenCalledWith(
      { email: "new-user@example.com", tokenHash: "hash" },
      otpTokens
    );
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
