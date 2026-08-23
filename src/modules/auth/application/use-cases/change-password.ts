import { AppError, NotFoundError } from "@/lib/errors";
import { AUTH_ERROR_CODES } from "@/modules/auth/errors";
import { hashPassword, verifyPassword } from "@/modules/auth/services/password";
import { validatePassword } from "@/modules/auth/services/password-policy";
import { runtimeEnv } from "@/lib/env/runtime";
import { logger } from "@/lib/logger";
import { logIdentifier } from "@/lib/security/log-identifier";
import type { AccountSecurityPort, RateLimitPort } from "../ports";

const PASSWORD_CHANGE_PREFIX = "auth:password-change:user:";

export async function changePassword(
  params: {
    userId: string;
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
  },
  dependencies: { accounts: AccountSecurityPort; rateLimiter: RateLimitPort }
): Promise<Date> {
  if (params.newPassword !== params.confirmPassword) {
    throw new AppError("Passwords do not match", AUTH_ERROR_CODES.PASSWORD_MISMATCH, 400);
  }
  validatePassword(params.newPassword);

  const key = `${PASSWORD_CHANGE_PREFIX}${params.userId}`;
  const limit = runtimeEnv.authPasswordEmailMaxAttempts;
  const windowSeconds = runtimeEnv.authPasswordRateLimitWindowSeconds;
  try {
    if ((await dependencies.rateLimiter.current(key, windowSeconds)) >= limit) {
      throw new AppError("Too many password change attempts", "password_rate_limited", 429);
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    logger.error(
      { error, subject: logIdentifier("user", params.userId) },
      "Password change rate limit check failed"
    );
    throw new AppError("Password change unavailable", "password_rate_limited", 429);
  }

  const currentPasswordHash = await dependencies.accounts.getPasswordHash(params.userId);
  if (currentPasswordHash === undefined) throw new NotFoundError("User");
  if (
    currentPasswordHash == null ||
    !(await verifyPassword(params.currentPassword, currentPasswordHash))
  ) {
    try {
      const result = await dependencies.rateLimiter.increment(key, limit, windowSeconds);
      if (!result.success || result.remaining === 0) {
        throw new AppError("Too many password change attempts", "password_rate_limited", 429);
      }
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error(
        { error, subject: logIdentifier("user", params.userId) },
        "Password change rate limit increment failed"
      );
      throw new AppError("Password change unavailable", "password_rate_limited", 429);
    }
    throw new AppError(
      "Current password is incorrect",
      AUTH_ERROR_CODES.CURRENT_PASSWORD_WRONG,
      400
    );
  }

  const passwordHash = await hashPassword(params.newPassword);
  const passwordUpdatedAt = new Date();
  const changed = await dependencies.accounts.changePassword({
    userId: params.userId,
    expectedPasswordHash: currentPasswordHash,
    passwordHash,
    passwordUpdatedAt,
  });
  if (!changed) throw new AppError("Password changed concurrently", "CONFLICT", 409);
  return passwordUpdatedAt;
}
