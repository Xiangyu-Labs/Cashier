import type { UserAccountPort } from "@/application/contracts";
import { runtimeEnv } from "@/lib/env/runtime";
import { logger } from "@/lib/logger";
import { logIdentifier } from "@/lib/security/log-identifier";
import { getClientIPFromHeaders, type HeadersLike } from "@/lib/utils/ip";
import type { AuthenticatedPrincipal } from "@/modules/auth/contracts";
import { AuthSignInError, AUTH_ERROR_CODES } from "@/modules/auth/errors";
import { normalizeEmail } from "@/lib/utils/email";
import { verifyPassword } from "@/modules/auth/services/password";
import type { RateLimitPort } from "../ports";

const PASSWORD_EMAIL_PREFIX = "auth:password:email:";
const PASSWORD_IP_PREFIX = "auth:password:ip:";
const DUMMY_PASSWORD_HASH = "$2b$12$E.Rov9WCSx5iCVVlYJTgLOGGjHYsuet/YKxmEZ03AXS8OY.ivReI2";

async function enforcePasswordRateLimits(
  email: string,
  ip: string,
  rateLimiter: RateLimitPort
): Promise<void> {
  try {
    const emailResult = await rateLimiter.increment(
      `${PASSWORD_EMAIL_PREFIX}${email}`,
      runtimeEnv.authPasswordEmailMaxAttempts,
      runtimeEnv.authPasswordRateLimitWindowSeconds
    );
    if (!emailResult.success) {
      throw new AuthSignInError(AUTH_ERROR_CODES.PASSWORD_RATE_LIMITED);
    }

    // "unknown" means no trusted proxy header was present. There is no
    // meaningful per-attacker bucket to share, and incrementing a single
    // shared bucket would let one client block password sign-ins for every
    // user. The email bucket still applies, so brute force remains bounded.
    if (ip !== "unknown") {
      const ipResult = await rateLimiter.increment(
        `${PASSWORD_IP_PREFIX}${ip}`,
        runtimeEnv.authPasswordIpMaxAttempts,
        runtimeEnv.authPasswordRateLimitWindowSeconds
      );
      if (!ipResult.success) {
        throw new AuthSignInError(AUTH_ERROR_CODES.PASSWORD_RATE_LIMITED);
      }
    }
  } catch (error) {
    if (error instanceof AuthSignInError) throw error;

    logger.error(
      {
        error,
        emailSubject: logIdentifier("email", email),
        ipSubject: logIdentifier("ip", ip),
      },
      "Password rate limit check failed"
    );
    throw new AuthSignInError(AUTH_ERROR_CODES.PASSWORD_RATE_LIMIT_UNAVAILABLE);
  }
}

export async function authenticateWithPassword(
  params: { email: string; password: string; requestHeaders: HeadersLike },
  dependencies: { users: UserAccountPort; rateLimiter: RateLimitPort }
): Promise<AuthenticatedPrincipal> {
  const email = normalizeEmail(params.email);
  const ip = getClientIPFromHeaders(params.requestHeaders);
  await enforcePasswordRateLimits(email, ip, dependencies.rateLimiter);

  const user = email === "" ? null : await dependencies.users.findByEmail(email);
  const valid = await verifyPassword(params.password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);

  if (user == null || !valid) {
    logger.warn({ subject: logIdentifier("email", email) }, "Password sign-in failed");
    throw new AuthSignInError(AUTH_ERROR_CODES.INVALID_CREDENTIALS);
  }

  return { id: user.id, email: user.email, name: user.name, image: user.image };
}
