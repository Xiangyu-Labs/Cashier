import { type NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { serverComposition } from "@/application/server-composition-root";
import type {
  AuthenticatedServiceCredentialContract,
  RateLimitResult,
} from "@/application/contracts";
import { UnauthorizedError, RateLimitError } from "@/lib/errors";
import { getErrorStatusCode, toSanitizedErrorResponse } from "@/lib/error-handlers";
import { runtimeEnv } from "@/lib/env/runtime";
import { getClientIPFromHeaders } from "@/lib/utils/ip";
import { logger } from "@/lib/logger";

// Number of token shards for invalid-bearer rate limiting to bound attacker-created bucket cardinality.
// The shard is derived from a hash of the bearer token modulo TOKEN_SHARD_COUNT.
const TOKEN_SHARD_COUNT = 256;

interface ApiV1Context {
  credential: AuthenticatedServiceCredentialContract;
  request: NextRequest;
  requestId: string;
}

// Pre-auth per-IP ceiling, applied before any credential parsing so a trusted
// client IP cannot be used to drive unbounded database authentication work.
const PRE_AUTH_IP_LIMIT_PER_MINUTE = 120;
// Invalid-bearer attempts per client IP + token shard, fixed 60-second window.
const INVALID_BEARER_LIMIT_PER_MINUTE = 30;
const RATE_LIMIT_WINDOW_SECONDS = 60;

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

/**
 * Parse a case-insensitive Bearer token. The header must contain exactly one
 * non-whitespace token after the scheme; anything else (missing header, empty
 * token, trailing non-whitespace content) returns null and is rejected with
 * 401 by the caller.
 */
function getBearerToken(request: NextRequest): string | null {
  const authHeader = request.headers.get("Authorization");
  if (authHeader == null) return null;
  const match = /^Bearer[ \t]+(\S+)$/i.exec(authHeader);
  return match?.[1] ?? null;
}

/**
 * Pre-auth per-IP rate-limit bucket key. The trusted client IP is stored only
 * as an HMAC digest so the raw address never reaches the database.
 */
function preAuthBucketKey(clientIp: string): string {
  const hmac = crypto.createHmac("sha256", `rl-pre-auth:${runtimeEnv.apiKeyPepper}`);
  hmac.update(clientIp);
  return `rl_api_v1_preauth:${hmac.digest("hex")}`;
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
 * Derive the credential-wide rate-limit bucket key from the credential ID
 * only. The quota is shared across POST and GET and across all client IPs, so
 * the IP must not be part of the key.
 */
function validCredentialBucketKey(credentialId: string): string {
  const hmac = crypto.createHmac("sha256", `rl-valid:${runtimeEnv.apiKeyPepper}`);
  hmac.update(credentialId);
  return `rl_valid_cred:${hmac.digest("hex")}`;
}

/**
 * Unix-millisecond reset boundary for the current fixed window. The Postgres
 * limiter aligns window starts the same way, so a pre-check that observes a
 * live bucket can report the exact reset time without an extra read.
 */
function currentWindowResetMs(windowSeconds: number): number {
  const windowStart = Math.floor(Date.now() / 1000 / windowSeconds) * windowSeconds;
  return (windowStart + windowSeconds) * 1000;
}

function applyRateLimitHeaders(
  response: NextResponse,
  limit: number,
  result: RateLimitResult
): void {
  // The wire contract uses Unix seconds; the adapter keeps milliseconds internally.
  response.headers.set("X-RateLimit-Limit", String(limit));
  response.headers.set("X-RateLimit-Remaining", String(result.remaining));
  response.headers.set("X-RateLimit-Reset", String(Math.floor(result.resetTime / 1000)));
}

export async function handleApiV1Route(
  request: NextRequest,
  { logContext, handler }: HandleApiV1RouteOptions
): Promise<NextResponse> {
  const requestId = crypto.randomUUID();
  const startedAt = performance.now();
  const stages: Record<string, number> = {};
  try {
    const clientIp = getClientIPFromHeaders(request.headers);

    // 1. Pre-auth per-IP ceiling before parsing or authenticating the token.
    //    When no trusted client IP is available this bucket is skipped so all
    //    clients never share one global fixed window.
    if (clientIp !== "unknown") {
      const preAuthStart = performance.now();
      const preAuthResult = await serverComposition.rateLimiter.increment(
        preAuthBucketKey(clientIp),
        PRE_AUTH_IP_LIMIT_PER_MINUTE,
        RATE_LIMIT_WINDOW_SECONDS
      );
      stages.preAuthRateLimitMs = Math.round(performance.now() - preAuthStart);
      if (!preAuthResult.success) {
        throw new RateLimitError("Rate limit exceeded", undefined, {
          limit: PRE_AUTH_IP_LIMIT_PER_MINUTE,
          remaining: preAuthResult.remaining,
          resetTime: preAuthResult.resetTime,
        });
      }
    }

    // 2. Case-insensitive Bearer parsing. Missing header, empty token, or
    //    trailing non-whitespace content is rejected without touching the DB.
    const token = getBearerToken(request);
    if (token == null) {
      throw new UnauthorizedError("Missing or invalid Authorization header");
    }

    // 3. When a trusted IP is available, short-circuit authentication once the
    //    invalid-bearer bucket for this IP + token shard is already exhausted.
    if (clientIp !== "unknown") {
      const invalidBucketKey = invalidBearerBucketKey(clientIp, token);
      const invalidCurrent = await serverComposition.rateLimiter.current(
        invalidBucketKey,
        RATE_LIMIT_WINDOW_SECONDS
      );
      if (invalidCurrent >= INVALID_BEARER_LIMIT_PER_MINUTE) {
        throw new RateLimitError("Rate limit exceeded", undefined, {
          limit: INVALID_BEARER_LIMIT_PER_MINUTE,
          remaining: 0,
          resetTime: currentWindowResetMs(RATE_LIMIT_WINDOW_SECONDS),
        });
      }
    }

    // 4. Authenticate the credential.
    const authStart = performance.now();
    const credential = await serverComposition.serviceCredentials.authenticate(token);
    stages.credentialAuthMs = Math.round(performance.now() - authStart);

    if (credential == null) {
      // 5. Only increment the invalid-bearer bucket when authentication fails
      //    and a trusted client IP is available. With "unknown" the bucket key
      //    would group every client into 256 token shards and let one client
      //    exhaust another client's invalid-attempt budget, so it is skipped
      //    exactly like the pre-auth IP ceiling.
      if (clientIp !== "unknown") {
        const invalidBucketKey = invalidBearerBucketKey(clientIp, token);
        const invalidRateResult = await serverComposition.rateLimiter.increment(
          invalidBucketKey,
          INVALID_BEARER_LIMIT_PER_MINUTE,
          RATE_LIMIT_WINDOW_SECONDS
        );
        if (!invalidRateResult.success) {
          throw new RateLimitError("Rate limit exceeded", undefined, {
            limit: INVALID_BEARER_LIMIT_PER_MINUTE,
            remaining: invalidRateResult.remaining,
            resetTime: invalidRateResult.resetTime,
          });
        }
      }
      throw new UnauthorizedError("Invalid Service Credential");
    }

    // 6. Credential-wide quota shared by POST and GET regardless of client IP.
    const validBucketKey = validCredentialBucketKey(credential.id);
    const apiRateLimit = runtimeEnv.apiRateLimitPerMinute;
    const rateLimitStart = performance.now();
    const validRateResult = await serverComposition.rateLimiter.increment(
      validBucketKey,
      apiRateLimit,
      RATE_LIMIT_WINDOW_SECONDS
    );
    stages.credentialRateLimitMs = Math.round(performance.now() - rateLimitStart);

    if (!validRateResult.success) {
      throw new RateLimitError("Rate limit exceeded", undefined, {
        limit: apiRateLimit,
        remaining: validRateResult.remaining,
        resetTime: validRateResult.resetTime,
      });
    }

    const result = await handler({ credential, request, requestId });
    const response = result.response;
    applyRateLimitHeaders(response, apiRateLimit, validRateResult);
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
        stages: { ...result.metrics?.stages, ...stages },
      },
      "api/v1 request completed"
    );
    return response;
  } catch (error) {
    const failure =
      error instanceof ApiV1HandlerFailure ? error : { cause: error, metrics: undefined };
    // Build the sanitized response exactly once and reuse the same projection
    // for logging, so the correlation ID is generated a single time.
    const sanitized = toSanitizedErrorResponse(failure.cause);
    const status = getErrorStatusCode(failure.cause);
    const response = NextResponse.json(sanitized, {
      status,
      headers: { "Cache-Control": "private, no-store", "X-Request-Id": requestId },
    });
    if (failure.cause instanceof UnauthorizedError) {
      response.headers.set("WWW-Authenticate", "Bearer");
    }
    if (failure.cause instanceof RateLimitError) {
      const resetTime = failure.cause.metadata?.resetTime;
      const retryAfter =
        resetTime == null
          ? failure.cause.retryAfter
          : Math.max(1, Math.ceil((resetTime - Date.now()) / 1000));
      if (retryAfter != null) {
        response.headers.set("Retry-After", String(retryAfter));
      }
      if (failure.cause.metadata?.limit !== undefined) {
        response.headers.set("X-RateLimit-Limit", String(failure.cause.metadata.limit));
      }
      if (failure.cause.metadata?.remaining !== undefined) {
        response.headers.set("X-RateLimit-Remaining", String(failure.cause.metadata.remaining));
      }
      if (resetTime !== undefined) {
        response.headers.set("X-RateLimit-Reset", String(Math.floor(resetTime / 1000)));
      }
    }
    const isClientError = status < 500;
    const log = isClientError ? logger.warn : logger.error;
    log(
      {
        requestId,
        logContext,
        status,
        errorCode: sanitized.error.code,
        durationMs: Math.round(performance.now() - startedAt),
        requestBytes: failure.metrics?.requestBytes,
        imageCount: failure.metrics?.imageCount,
        decodedBytes: failure.metrics?.decodedBytes,
        stages: { ...failure.metrics?.stages, ...stages },
      },
      "api/v1 request failed"
    );
    return response;
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
