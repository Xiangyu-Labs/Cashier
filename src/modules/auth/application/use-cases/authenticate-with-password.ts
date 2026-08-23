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

type PasswordRateLimitReservation = { key: string; resetTime: number };

async function reservePasswordRateLimits(
  email: string,
  ip: string,
  rateLimiter: RateLimitPort
): Promise<PasswordRateLimitReservation[]> {
  const reservations: PasswordRateLimitReservation[] = [];
  const windowSeconds = runtimeEnv.authPasswordRateLimitWindowSeconds;
  try {
    const emailKey = `${PASSWORD_EMAIL_PREFIX}${email}`;
    const emailResult = await rateLimiter.increment(
      emailKey,
      runtimeEnv.authPasswordEmailMaxAttempts,
      windowSeconds
    );
    if (!emailResult.success) {
      throw new AuthSignInError(AUTH_ERROR_CODES.PASSWORD_RATE_LIMITED);
    }
    reservations.push({ key: emailKey, resetTime: emailResult.resetTime });

    // "unknown" means no trusted proxy header was present. There is no
    // meaningful per-attacker bucket to share, and incrementing a single
    // shared bucket would let one client block password sign-ins for every
    // user. The email bucket still applies, so brute force remains bounded.
    if (ip !== "unknown") {
      const ipKey = `${PASSWORD_IP_PREFIX}${ip}`;
      const ipResult = await rateLimiter.increment(
        ipKey,
        runtimeEnv.authPasswordIpMaxAttempts,
        windowSeconds
      );
      if (!ipResult.success) {
        await Promise.all(
          reservations.map((reservation) =>
            rateLimiter.releaseIncrement(reservation.key, windowSeconds, reservation.resetTime)
          )
        );
        throw new AuthSignInError(AUTH_ERROR_CODES.PASSWORD_RATE_LIMITED);
      }
      reservations.push({ key: ipKey, resetTime: ipResult.resetTime });
    }
    return reservations;
  } catch (error) {
    if (error instanceof AuthSignInError) throw error;

    await Promise.allSettled(
      reservations.map((reservation) =>
        rateLimiter.releaseIncrement(reservation.key, windowSeconds, reservation.resetTime)
      )
    );

    logger.error(
      {
        error,
        emailSubject: logIdentifier("email", email),
        ipSubject: logIdentifier("ip", ip),
      },
      "Password rate limit reservation failed"
    );
    throw new AuthSignInError(AUTH_ERROR_CODES.PASSWORD_RATE_LIMIT_UNAVAILABLE);
  }
}

async function releasePasswordRateLimits(
  reservations: PasswordRateLimitReservation[],
  email: string,
  ip: string,
  rateLimiter: RateLimitPort
) {
  try {
    const windowSeconds = runtimeEnv.authPasswordRateLimitWindowSeconds;
    await Promise.all(
      reservations.map((reservation) =>
        rateLimiter.releaseIncrement(reservation.key, windowSeconds, reservation.resetTime)
      )
    );
  } catch (error) {
    logger.error(
      { error, emailSubject: logIdentifier("email", email), ipSubject: logIdentifier("ip", ip) },
      "Password rate limit release failed"
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
  const reservations = await reservePasswordRateLimits(email, ip, dependencies.rateLimiter);

  let user: Awaited<ReturnType<UserAccountPort["findByEmail"]>>;
  let valid: boolean;
  try {
    user = email === "" ? null : await dependencies.users.findByEmail(email);
    valid = await verifyPassword(params.password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
  } catch (error) {
    await releasePasswordRateLimits(reservations, email, ip, dependencies.rateLimiter);
    throw error;
  }

  if (user == null || !valid) {
    logger.warn({ subject: logIdentifier("email", email) }, "Password sign-in failed");
    throw new AuthSignInError(AUTH_ERROR_CODES.INVALID_CREDENTIALS);
  }

  await releasePasswordRateLimits(reservations, email, ip, dependencies.rateLimiter);

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
