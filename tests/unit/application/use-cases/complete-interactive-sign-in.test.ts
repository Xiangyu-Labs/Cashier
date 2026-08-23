import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  EmailDeliveryPort,
  LedgerPort,
  OtpTokenPort,
  UserAccountPort,
} from "@/application/contracts";
import { AUTH_ERROR_CODES, AuthSignInError } from "@/modules/auth/errors";
import type { AuthenticatedPrincipal } from "@/modules/auth/contracts";

const {
  ensureUserLedgerMock,
  consumeOTPClaimMock,
  releaseOTPClaimMock,
  sendLoginNotificationMock,
} = vi.hoisted(() => ({
  ensureUserLedgerMock: vi.fn(),
  consumeOTPClaimMock: vi.fn(),
  releaseOTPClaimMock: vi.fn(),
  sendLoginNotificationMock: vi.fn(),
}));

vi.mock("@/modules/workspace/application/use-cases/ensure-user-ledger", () => ({
  ensureUserLedger: ensureUserLedgerMock,
}));

vi.mock("@/modules/auth/services/otp-verification", () => ({
  consumeOTPClaim: consumeOTPClaimMock,
  releaseOTPClaim: releaseOTPClaimMock,
}));

vi.mock("@/modules/auth/services/notifications", () => ({
  sendLoginNotification: sendLoginNotificationMock,
}));

import { completeInteractiveSignIn } from "@/application/use-cases/complete-interactive-sign-in";

const ledgers = {} as LedgerPort;
const otpTokens = {} as OtpTokenPort;
const users = {
  completeRegistration: vi.fn().mockResolvedValue(true),
} as unknown as UserAccountPort;
const emailDelivery = {} as EmailDeliveryPort;
const dependencies = { ledgers, otpTokens, users, emailDelivery };
const principal: AuthenticatedPrincipal = {
  id: "user-1",
  email: "user@example.com",
  name: "User",
  image: null,
  locale: "en",
  authVersion: 1,
  registrationCompletedAt: new Date("2026-01-01T00:00:00.000Z"),
};
const otpPrincipal: AuthenticatedPrincipal = {
  ...principal,
  pendingOtpClaim: { email: "user@example.com", tokenHash: "v2:hash:salt" },
};

describe("completeInteractiveSignIn", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ensureUserLedgerMock.mockResolvedValue({ ledgerId: "ledger-1", created: false });
    consumeOTPClaimMock.mockResolvedValue(true);
    releaseOTPClaimMock.mockResolvedValue(true);
    sendLoginNotificationMock.mockResolvedValue(undefined);
  });

  it("ensures the default ledger with the principal locale", async () => {
    const result = await completeInteractiveSignIn(principal, dependencies);

    expect(ensureUserLedgerMock).toHaveBeenCalledWith({ userId: "user-1", locale: "en" }, ledgers);
    expect(result).toEqual(principal);
    expect(consumeOTPClaimMock).not.toHaveBeenCalled();
  });

  it("omits an empty locale from the ledger request", async () => {
    await completeInteractiveSignIn({ ...principal, locale: "" }, dependencies);

    expect(ensureUserLedgerMock).toHaveBeenCalledWith({ userId: "user-1" }, ledgers);
  });

  it("consumes the OTP claim only after ledger setup succeeds", async () => {
    const result = await completeInteractiveSignIn(otpPrincipal, dependencies);

    expect(consumeOTPClaimMock).toHaveBeenCalledWith(
      { email: "user@example.com", tokenHash: "v2:hash:salt" },
      otpTokens
    );
    expect(result).toEqual(principal);
    expect(result).not.toHaveProperty("pendingOtpClaim");
  });

  it("releases the OTP claim and propagates ledger setup failures", async () => {
    ensureUserLedgerMock.mockRejectedValueOnce(new Error("ledger unavailable"));

    await expect(completeInteractiveSignIn(otpPrincipal, dependencies)).rejects.toThrow(
      "ledger unavailable"
    );

    expect(releaseOTPClaimMock).toHaveBeenCalledWith(
      { email: "user@example.com", tokenHash: "v2:hash:salt" },
      otpTokens
    );
    expect(consumeOTPClaimMock).not.toHaveBeenCalled();
  });

  it("releases the OTP claim when registration completion fails", async () => {
    vi.mocked(users.completeRegistration).mockRejectedValueOnce(
      new Error("registration unavailable")
    );

    await expect(
      completeInteractiveSignIn({ ...otpPrincipal, registrationCompletedAt: null }, dependencies)
    ).rejects.toThrow("registration unavailable");
    expect(releaseOTPClaimMock).toHaveBeenCalledWith(otpPrincipal.pendingOtpClaim, otpTokens);
    expect(consumeOTPClaimMock).not.toHaveBeenCalled();
  });

  it("propagates ledger setup failures without a claim", async () => {
    ensureUserLedgerMock.mockRejectedValueOnce(new Error("ledger unavailable"));

    await expect(completeInteractiveSignIn(principal, dependencies)).rejects.toThrow(
      "ledger unavailable"
    );
    expect(releaseOTPClaimMock).not.toHaveBeenCalled();
  });

  it("fails the sign-in when the OTP claim can no longer be consumed", async () => {
    consumeOTPClaimMock.mockResolvedValue(false);

    let caught: unknown;
    try {
      await completeInteractiveSignIn(otpPrincipal, dependencies);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(AuthSignInError);
    expect(caught).toMatchObject({ code: AUTH_ERROR_CODES.OTP_INVALID });
  });

  it("marks registration complete after ledger setup and skips the first-login notification", async () => {
    await completeInteractiveSignIn(
      { ...principal, registrationCompletedAt: null, isNewUser: true },
      dependencies
    );

    expect(users.completeRegistration).toHaveBeenCalledWith("user-1", expect.any(Date));
    expect(sendLoginNotificationMock).not.toHaveBeenCalled();
  });

  it("sends an existing-user notification and removes transient new-user state", async () => {
    const result = await completeInteractiveSignIn(
      { ...principal, isNewUser: false },
      dependencies
    );

    expect(sendLoginNotificationMock).toHaveBeenCalledWith(
      { email: "user@example.com", locale: "en" },
      emailDelivery
    );
    expect(result).not.toHaveProperty("isNewUser");
  });

  it("releases the claim when consuming it throws", async () => {
    consumeOTPClaimMock.mockRejectedValueOnce(new Error("consume unavailable"));

    await expect(completeInteractiveSignIn(otpPrincipal, dependencies)).rejects.toThrow(
      "consume unavailable"
    );
    expect(releaseOTPClaimMock).toHaveBeenCalledWith(otpPrincipal.pendingOtpClaim, otpTokens);
  });
});
