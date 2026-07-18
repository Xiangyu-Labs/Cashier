import { type NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { currentApplication } from "@/application/current";
import type { AuthenticatedServiceCredentialContract } from "@/application/contracts";
import { rateLimitApiV1 } from "@/lib/ratelimit";
import { postgresRateLimiter } from "@/application/adapters/postgres/api-rate-limit";
import { UnauthorizedError, RateLimitError } from "@/lib/errors";
import { getErrorStatusCode, logError, toSanitizedErrorResponse } from "@/lib/error-handlers";
import { runtimeEnv } from "@/lib/env/runtime";

// Number of token shards for invalid-bearer rate limiting to bound attacker-created bucket cardinality.
// The shard is derived from a hash of the bearer token modulo TOKEN_SHARD_COUNT.
const TOKEN_SHARD_COUNT = 256;

interface ApiV1Context {
  credential: AuthenticatedServiceCredentialContract;
  key: string;
  request: NextRequest;
}

interface HandleApiV1RouteOptions {
  logContext: string;
  handler: (context: ApiV1Context) => Promise<NextResponse>;
}

function getBearerKey(request: NextRequest): string {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new UnauthorizedError("Missing or invalid Authorization header");
  }

  return authHeader.slice("Bearer ".length);
}

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() ?? "127.0.0.1";
  }
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp;
  return "127.0.0.1";
}

/**
 * Derive an invalid-bearer rate-limit bucket key from client IP and a shard of the token.
 * Uses HMAC-SHA-256 of client IP and a bounded shard derived from the bearer to prevent
 * attacker-created bucket enumeration while avoiding raw IP/token storage.
 */
function invalidBearerBucketKey(clientIp: string, bearerToken: string): string {
  const tokenShard =
    (crypto.createHash("sha256").update(bearerToken).digest()[0] ?? 0) % TOKEN_SHARD_COUNT;
  const hmac = crypto.createHmac("sha256", `rl-invalid:${runtimeEnv.apiKeyPepper}`);
  hmac.update(clientIp);
  hmac.update(`:${tokenShard}`);
  return `rl_invalid_bearer:${hmac.digest("hex")}`;
}

/**
 * Derive a valid-credential rate-limit bucket key from credential ID and client IP.
 */
function validCredentialBucketKey(credentialId: string, clientIp: string): string {
  const hmac = crypto.createHmac("sha256", `rl-valid:${runtimeEnv.apiKeyPepper}`);
  hmac.update(credentialId);
  hmac.update(`:${clientIp}`);
  return `rl_valid_cred:${hmac.digest("hex")}`;
}

// Rate limit config for pre-auth invalid bearer attempts (per IP + token shard)
const RATE_LIMIT_INVALID_PER_MINUTE = 30;
const RATE_LIMIT_WINDOW_SECONDS = 60;

export async function handleApiV1Route(
  request: NextRequest,
  { logContext, handler }: HandleApiV1RouteOptions
): Promise<NextResponse> {
  try {
    const key = getBearerKey(request);

    // Pre-auth: rate limit invalid bearer attempts BEFORE credential lookup
    const clientIp = getClientIp(request);
    const invalidBucketKey = invalidBearerBucketKey(clientIp, key);

    // We need to check rate limit before credential lookup, but we don't know
    // if the credential is valid yet. Use a lighter pre-auth limit for all requests,
    // then apply the strict valid credential limit after auth.
    // Apply invalid-bearer rate limiting
    const invalidRateResult = await postgresRateLimiter.increment(
      invalidBucketKey,
      RATE_LIMIT_INVALID_PER_MINUTE,
      RATE_LIMIT_WINDOW_SECONDS
    );

    if (!invalidRateResult.success) {
      throw new RateLimitError("Rate limit exceeded");
    }

    // Now authenticate
    const credential = await currentApplication.serviceCredentials.authenticate(key);

    if (credential == null) {
      throw new UnauthorizedError("Invalid Service Credential");
    }

    // Post-auth: valid credential rate limiting
    const validBucketKey = validCredentialBucketKey(credential.id, clientIp);
    const apiRateLimit = runtimeEnv.apiRateLimitPerMinute;
    const validRateResult = await postgresRateLimiter.increment(
      validBucketKey,
      apiRateLimit,
      RATE_LIMIT_WINDOW_SECONDS
    );

    if (!validRateResult.success) {
      throw new RateLimitError("Rate limit exceeded");
    }

    return await handler({ request, key, credential });
  } catch (error) {
    logError(logContext, error);
    return NextResponse.json(toSanitizedErrorResponse(error), { status: getErrorStatusCode(error) });
  }
}
