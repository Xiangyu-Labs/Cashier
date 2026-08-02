import { CredentialsSignin } from "@auth/core/errors";
import type { User } from "next-auth";
import { AUTH_ERROR_CODES } from "@/modules/auth/errors";
import { isValidOTPFormat } from "@/modules/auth/services/otp";
import { checkVerifyRateLimit } from "@/modules/auth/services/otp-rate-limit";
import {
  consumeOTPClaim,
  findOTPRecord,
  releaseOTPClaim,
  verifyOTPWithPolicy,
} from "@/modules/auth/services/otp-verification";
import { logger } from "@/lib/logger";
import { logIdentifier } from "@/lib/security/log-identifier";
import { normalizeEmail } from "@/lib/utils/email";
import { getClientIPFromHeaders, type HeadersLike } from "@/lib/utils/ip";
import { ensureUserLedger } from "@/modules/workspace/application/use-cases/ensure-user-ledger";
import { assertRegistrationAllowed } from "./registration-policy";
import type { LedgerPort, OtpTokenPort, UserAccountPort } from "@/application/contracts";
import type { RateLimitPort } from "../ports";

const MAX_EMAIL_LENGTH = 254;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

class OTPCredentialsSigninError extends CredentialsSignin {
  constructor(code: string) {
    super();
    this.code = code;
  }
}

export class OTPInvalidSignInError extends OTPCredentialsSigninError {
  constructor() {
    super(AUTH_ERROR_CODES.OTP_INVALID);
  }
}

export class OTPExpiredSignInError extends OTPCredentialsSigninError {
  constructor() {
    super(AUTH_ERROR_CODES.OTP_EXPIRED);
  }
}

export class OTPLockedSignInError extends OTPCredentialsSigninError {
  constructor() {
    super(AUTH_ERROR_CODES.OTP_LOCKED);
  }
}

export class OTPRateLimitedSignInError extends OTPCredentialsSigninError {
  constructor() {
    super(AUTH_ERROR_CODES.OTP_RATE_LIMITED);
  }
}

function validateCredentials(email: string, otp: string): string {
  if (email === "" || email.length > MAX_EMAIL_LENGTH) {
    throw new OTPInvalidSignInError();
  }

  const normalizedEmail = normalizeEmail(email);
  if (!EMAIL_REGEX.test(normalizedEmail)) {
    throw new OTPInvalidSignInError();
  }

  if (!isValidOTPFormat(otp)) {
    throw new OTPInvalidSignInError();
  }

  return normalizedEmail;
}

export async function authenticateWithOTP(
  params: {
    email: string;
    otp: string;
    locale?: string;
    requestHeaders: HeadersLike;
  },
  dependencies: {
    userAccounts: UserAccountPort;
    otpTokens: OtpTokenPort;
    ledgers: LedgerPort;
    rateLimiter: RateLimitPort;
  }
): Promise<User> {
  const normalizedEmail = validateCredentials(params.email, params.otp);
  const locale = params.locale ?? "zh";

  const record = await findOTPRecord(normalizedEmail, dependencies.otpTokens);
  if (record == null) {
    logger.warn(
      { subject: logIdentifier("email", normalizedEmail) },
      "OTP token not found during sign-in"
    );
    throw new OTPInvalidSignInError();
  }

  if (record.lockedUntil != null && record.lockedUntil > new Date()) {
    logger.warn(
      { subject: logIdentifier("email", normalizedEmail), lockedUntil: record.lockedUntil },
      "OTP account locked"
    );
    throw new OTPLockedSignInError();
  }

  const ip = getClientIPFromHeaders(params.requestHeaders);
  const isAllowed = await checkVerifyRateLimit(ip, dependencies.rateLimiter);
  if (!isAllowed) {
    logger.warn(
      {
        ipSubject: logIdentifier("ip", ip),
        emailSubject: logIdentifier("email", normalizedEmail),
      },
      "OTP verify rate limit exceeded during sign-in"
    );
    throw new OTPRateLimitedSignInError();
  }

  const result = await verifyOTPWithPolicy(
    normalizedEmail,
    params.otp,
    record,
    dependencies.otpTokens
  );

  if (!result.success) {
    logger.warn(
      {
        subject: logIdentifier("email", normalizedEmail),
        reason: result.reason,
        attemptsRemaining: result.attemptsRemaining,
      },
      "OTP verification failed during sign-in"
    );

    switch (result.reason) {
      case "expired":
        throw new OTPExpiredSignInError();
      case "locked":
      case "max_attempts":
        throw new OTPLockedSignInError();
      default:
        throw new OTPInvalidSignInError();
    }
  }

  const claim = { email: normalizedEmail, tokenHash: record.tokenHash };
  try {
    await assertRegistrationAllowed(normalizedEmail, dependencies.userAccounts);
    const { user } = await dependencies.userAccounts.findOrCreate(normalizedEmail);

    await ensureUserLedger(
      {
        userId: user.id,
        locale,
      },
      dependencies.ledgers
    );
    if (!(await consumeOTPClaim(claim, dependencies.otpTokens))) {
      throw new OTPInvalidSignInError();
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
      locale,
    };
  } catch (error) {
    await releaseOTPClaim(claim, dependencies.otpTokens).catch((releaseError) => {
      logger.error(
        { error: releaseError, subject: logIdentifier("email", normalizedEmail) },
        "Failed to release OTP claim"
      );
    });
    throw error;
  }
}
