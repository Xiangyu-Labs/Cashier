import { type NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { currentApplication } from "@/application/current";
import type { AuthenticatedServiceCredentialContract } from "@/application/contracts";
import { postgresRateLimiter } from "@/application/adapters/postgres/api-rate-limit";
import { UnauthorizedError, RateLimitError } from "@/lib/errors";
import { getErrorStatusCode, logError, toSanitizedErrorResponse } from "@/lib/error-handlers";
import { runtimeEnv } from "@/lib/env/runtime";
import { getClientIPFromHeaders } from "@/lib/utils/ip";

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

    // Authenticate first
    const credential = await currentApplication.serviceCredentials.authenticate(key);

    const clientIp = getClientIPFromHeaders(request.headers);

    if (credential == null) {
      // Only increment invalid-bearer bucket when authentication actually fails.
      // Successful auth never consumes the invalid-attempt budget.
      const invalidBucketKey = invalidBearerBucketKey(clientIp, key);
      const invalidRateResult = await postgresRateLimiter.increment(
        invalidBucketKey,
        RATE_LIMIT_INVALID_PER_MINUTE,
        RATE_LIMIT_WINDOW_SECONDS
      );
      if (!invalidRateResult.success) {
        throw new RateLimitError("Rate limit exceeded");
      }
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
