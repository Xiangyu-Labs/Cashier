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
    const windowSeconds = runtimeEnv.authPasswordRateLimitWindowSeconds;
    const [emailAttempts, ipAttempts] = await Promise.all([
      rateLimiter.current(`${PASSWORD_EMAIL_PREFIX}${email}`, windowSeconds),
      ip === "unknown"
        ? Promise.resolve(0)
        : rateLimiter.current(`${PASSWORD_IP_PREFIX}${ip}`, windowSeconds),
    ]);
    if (emailAttempts >= runtimeEnv.authPasswordEmailMaxAttempts) {
      throw new AuthSignInError(AUTH_ERROR_CODES.PASSWORD_RATE_LIMITED);
    }

    // "unknown" means no trusted proxy header was present. There is no
    // meaningful per-attacker bucket to share, and incrementing a single
    // shared bucket would let one client block password sign-ins for every
    // user. The email bucket still applies, so brute force remains bounded.
    if (ip !== "unknown" && ipAttempts >= runtimeEnv.authPasswordIpMaxAttempts) {
      throw new AuthSignInError(AUTH_ERROR_CODES.PASSWORD_RATE_LIMITED);
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

async function recordPasswordFailure(email: string, ip: string, rateLimiter: RateLimitPort) {
  try {
    const windowSeconds = runtimeEnv.authPasswordRateLimitWindowSeconds;
    const [emailResult, ipResult] = await Promise.all([
      rateLimiter.increment(
        `${PASSWORD_EMAIL_PREFIX}${email}`,
        runtimeEnv.authPasswordEmailMaxAttempts,
        windowSeconds
      ),
      ip === "unknown"
        ? Promise.resolve({ success: true })
        : rateLimiter.increment(
            `${PASSWORD_IP_PREFIX}${ip}`,
            runtimeEnv.authPasswordIpMaxAttempts,
            windowSeconds
          ),
    ]);
    if (!emailResult.success || !ipResult.success) {
      throw new AuthSignInError(AUTH_ERROR_CODES.PASSWORD_RATE_LIMITED);
    }
  } catch (error) {
    if (error instanceof AuthSignInError) throw error;
    logger.error(
      { error, emailSubject: logIdentifier("email", email), ipSubject: logIdentifier("ip", ip) },
      "Password rate limit increment failed"
    );
    throw new AuthSignInError(AUTH_ERROR_CODES.PASSWORD_RATE_LIMIT_UNAVAILABLE);
  }
}

export async function authenticateWithPassword(
  params: { email: string; password: string; locale?: string; requestHeaders: HeadersLike },
  dependencies: { users: UserAccountPort; rateLimiter: RateLimitPort }
): Promise<AuthenticatedPrincipal> {
  const email = normalizeEmail(params.email);
  const ip = getClientIPFromHeaders(params.requestHeaders);
  await enforcePasswordRateLimits(email, ip, dependencies.rateLimiter);

  const user = email === "" ? null : await dependencies.users.findByEmail(email);
  const valid = await verifyPassword(params.password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);

  if (user == null || !valid) {
    await recordPasswordFailure(email, ip, dependencies.rateLimiter);
    logger.warn({ subject: logIdentifier("email", email) }, "Password sign-in failed");
    throw new AuthSignInError(AUTH_ERROR_CODES.INVALID_CREDENTIALS);
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    image: user.image,
    authVersion: user.authVersion,
    registrationCompletedAt: user.registrationCompletedAt,
    ...(params.locale === undefined ? {} : { locale: params.locale }),
    isNewUser: false,
  };
}
