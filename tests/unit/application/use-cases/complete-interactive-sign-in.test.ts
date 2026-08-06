import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LedgerPort, OtpTokenPort } from "@/application/contracts";
import { AUTH_ERROR_CODES, AuthSignInError } from "@/modules/auth/errors";
import type { AuthenticatedPrincipal } from "@/modules/auth/contracts";

const { ensureUserLedgerMock, consumeOTPClaimMock, releaseOTPClaimMock } = vi.hoisted(() => ({
  ensureUserLedgerMock: vi.fn(),
  consumeOTPClaimMock: vi.fn(),
  releaseOTPClaimMock: vi.fn(),
}));

vi.mock("@/modules/workspace/application/use-cases/ensure-user-ledger", () => ({
  ensureUserLedger: ensureUserLedgerMock,
}));

vi.mock("@/modules/auth/services/otp-verification", () => ({
  consumeOTPClaim: consumeOTPClaimMock,
  releaseOTPClaim: releaseOTPClaimMock,
}));

import { completeInteractiveSignIn } from "@/application/use-cases/complete-interactive-sign-in";

const ledgers = {} as LedgerPort;
const otpTokens = {} as OtpTokenPort;
const principal: AuthenticatedPrincipal = {
  id: "user-1",
  email: "user@example.com",
  name: "User",
  image: null,
  locale: "en",
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
  });

  it("ensures the default ledger with the principal locale", async () => {
    const result = await completeInteractiveSignIn(principal, { ledgers, otpTokens });

    expect(ensureUserLedgerMock).toHaveBeenCalledWith({ userId: "user-1", locale: "en" }, ledgers);
    expect(result).toEqual(principal);
    expect(consumeOTPClaimMock).not.toHaveBeenCalled();
  });

  it("omits an empty locale from the ledger request", async () => {
    await completeInteractiveSignIn({ ...principal, locale: "" }, { ledgers, otpTokens });

    expect(ensureUserLedgerMock).toHaveBeenCalledWith({ userId: "user-1" }, ledgers);
  });

  it("consumes the OTP claim only after ledger setup succeeds", async () => {
    const result = await completeInteractiveSignIn(otpPrincipal, { ledgers, otpTokens });

    expect(consumeOTPClaimMock).toHaveBeenCalledWith(
      { email: "user@example.com", tokenHash: "v2:hash:salt" },
      otpTokens
    );
    expect(result).toEqual(principal);
    expect(result).not.toHaveProperty("pendingOtpClaim");
  });

  it("releases the OTP claim and propagates ledger setup failures", async () => {
    ensureUserLedgerMock.mockRejectedValueOnce(new Error("ledger unavailable"));

    await expect(completeInteractiveSignIn(otpPrincipal, { ledgers, otpTokens })).rejects.toThrow(
      "ledger unavailable"
    );

    expect(releaseOTPClaimMock).toHaveBeenCalledWith(
      { email: "user@example.com", tokenHash: "v2:hash:salt" },
      otpTokens
    );
    expect(consumeOTPClaimMock).not.toHaveBeenCalled();
  });

  it("propagates ledger setup failures without a claim", async () => {
    ensureUserLedgerMock.mockRejectedValueOnce(new Error("ledger unavailable"));

    await expect(completeInteractiveSignIn(principal, { ledgers, otpTokens })).rejects.toThrow(
      "ledger unavailable"
    );
    expect(releaseOTPClaimMock).not.toHaveBeenCalled();
  });

  it("fails the sign-in when the OTP claim can no longer be consumed", async () => {
    consumeOTPClaimMock.mockResolvedValue(false);

    let caught: unknown;
    try {
      await completeInteractiveSignIn(otpPrincipal, { ledgers, otpTokens });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(AuthSignInError);
    expect(caught).toMatchObject({ code: AUTH_ERROR_CODES.OTP_INVALID });
  });
});
