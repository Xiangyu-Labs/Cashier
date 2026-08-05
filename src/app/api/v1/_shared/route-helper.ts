import { type NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { serverComposition } from "@/application/server-composition-root";
import type { AuthenticatedServiceCredentialContract } from "@/application/contracts";
import { postgresRateLimiter } from "@/application/adapters/postgres/api-rate-limit";
import { UnauthorizedError, RateLimitError } from "@/lib/errors";
import { getErrorStatusCode, logError, toSanitizedErrorResponse } from "@/lib/error-handlers";
import { runtimeEnv } from "@/lib/env/runtime";
import { getClientIPFromHeaders } from "@/lib/utils/ip";
import { logger } from "@/lib/logger";

// Number of token shards for invalid-bearer rate limiting to bound attacker-created bucket cardinality.
// The shard is derived from a hash of the bearer token modulo TOKEN_SHARD_COUNT.
const TOKEN_SHARD_COUNT = 256;

interface ApiV1Context {
  credential: AuthenticatedServiceCredentialContract;
  key: string;
  request: NextRequest;
  requestId: string;
}

/**
 * Request-level metrics collected by a route handler. Never contains the
 * bearer key, image content, base64 payloads, or raw client identifiers.
 */
export interface ApiV1RequestMetrics {
  requestBytes: number;
  imageCount: number;
  decodedBytes: number;
  stages: Record<string, number>;
}

interface ApiV1RouteResult {
  response: NextResponse;
  metrics?: ApiV1RequestMetrics;
}

interface HandleApiV1RouteOptions {
  logContext: string;
  handler: (context: ApiV1Context) => Promise<ApiV1RouteResult>;
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
  const requestId = crypto.randomUUID();
  const startedAt = performance.now();
  try {
    const key = getBearerKey(request);

    // Authenticate first
    const credential = await serverComposition.serviceCredentials.authenticate(key);

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

    const authMs = performance.now() - startedAt;
    const result = await handler({ request, key, credential, requestId });
    const response = result.response;
    response.headers.set("X-Request-Id", requestId);
    response.headers.set("Cache-Control", "private, no-store");
    logger.info(
      {
        requestId,
        logContext,
        status: response.status,
        durationMs: Math.round(performance.now() - startedAt),
        requestBytes: result.metrics?.requestBytes,
        imageCount: result.metrics?.imageCount,
        decodedBytes: result.metrics?.decodedBytes,
        stages: { ...result.metrics?.stages, authMs: Math.round(authMs) },
      },
      "api/v1 request completed"
    );
    return response;
  } catch (error) {
    const failure =
      error instanceof ApiV1HandlerFailure ? error : { cause: error, metrics: undefined };
    logError(logContext, failure.cause);
    const isClientError = getErrorStatusCode(failure.cause) < 500;
    const log = isClientError ? logger.warn : logger.error;
    log(
      {
        requestId,
        logContext,
        durationMs: Math.round(performance.now() - startedAt),
        requestBytes: failure.metrics?.requestBytes,
        imageCount: failure.metrics?.imageCount,
        decodedBytes: failure.metrics?.decodedBytes,
        stages: failure.metrics?.stages,
      },
      "api/v1 request failed"
    );
    return NextResponse.json(toSanitizedErrorResponse(failure.cause), {
      status: getErrorStatusCode(failure.cause),
      headers: { "Cache-Control": "private, no-store", "X-Request-Id": requestId },
    });
  }
}

/**
 * Carries partial request metrics from a failed handler to the route helper
 * so failure logs still record request bytes and per-stage timing without
 * leaking request contents.
 */
export class ApiV1HandlerFailure extends Error {
  readonly cause: unknown;
  readonly metrics: ApiV1RequestMetrics | undefined;

  constructor(cause: unknown, metrics?: ApiV1RequestMetrics) {
    super("API v1 route handler failed", { cause });
    this.name = "ApiV1HandlerFailure";
    this.cause = cause;
    this.metrics = metrics;
  }
}
