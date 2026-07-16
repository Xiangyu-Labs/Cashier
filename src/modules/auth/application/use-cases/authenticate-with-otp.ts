import { CredentialsSignin } from "@auth/core/errors";
import type { User } from "next-auth";
import { deleteOTPToken } from "@/modules/auth/repositories/otp-repository";
import { AUTH_ERROR_CODES } from "@/modules/auth/errors";
import { isValidOTPFormat } from "@/modules/auth/services/otp";
import { checkVerifyRateLimit } from "@/modules/auth/services/otp-rate-limit";
import { findOTPRecord, verifyOTPWithPolicy } from "@/modules/auth/services/otp-verification";
import { logger } from "@/lib/logger";
import { normalizeEmail } from "@/lib/utils/email";
import { getClientIPFromHeaders, type HeadersLike } from "@/lib/utils/ip";
import { ensureUserLedger } from "@/modules/workspace/application/use-cases/ensure-user-ledger";
import { assertRegistrationAllowed } from "./registration-policy";
import type { UserAccountPort } from "@/application/contracts";
import { currentApplication } from "@/application/current";

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

export async function authenticateWithOTP(params: {
  email: string;
  otp: string;
  locale?: string;
  requestHeaders: HeadersLike;
}, userAccounts: UserAccountPort = currentApplication.userAccounts): Promise<User> {
  const normalizedEmail = validateCredentials(params.email, params.otp);
  const locale = params.locale ?? "zh";

  const record = await findOTPRecord(normalizedEmail);
  if (record == null) {
    logger.warn({ email: normalizedEmail }, "OTP token not found during sign-in");
    throw new OTPInvalidSignInError();
  }

  if (record.lockedUntil != null && record.lockedUntil > new Date()) {
    logger.warn({ email: normalizedEmail, lockedUntil: record.lockedUntil }, "OTP account locked");
    throw new OTPLockedSignInError();
  }

  const ip = getClientIPFromHeaders(params.requestHeaders);
  const isAllowed = await checkVerifyRateLimit(ip);
  if (!isAllowed) {
    logger.warn({ ip, email: normalizedEmail }, "OTP verify rate limit exceeded during sign-in");
    throw new OTPRateLimitedSignInError();
  }

  const result = await verifyOTPWithPolicy(normalizedEmail, params.otp, record);

  if (!result.success) {
    logger.warn(
      {
        email: normalizedEmail,
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

  await assertRegistrationAllowed(normalizedEmail);

  const { user, isExistingUser } = await userAccounts.findOrCreate(normalizedEmail);

  if (!isExistingUser) {
    await ensureUserLedger({
      userId: user.id,
      locale,
    });
  }

  await deleteOTPToken(normalizedEmail);

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    image: user.image,
    locale,
  };
}
