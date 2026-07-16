import { type NextRequest, NextResponse } from "next/server";
import { currentApplication } from "@/application/current";
import type { AuthenticatedServiceCredentialContract } from "@/application/contracts";
import { rateLimitApiV1 } from "@/lib/ratelimit";
import { UnauthorizedError, RateLimitError } from "@/lib/errors";
import { getErrorStatusCode, logError, toSanitizedErrorResponse } from "@/lib/error-handlers";

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

export async function handleApiV1Route(
  request: NextRequest,
  { logContext, handler }: HandleApiV1RouteOptions
): Promise<NextResponse> {
  try {
    const key = getBearerKey(request);
    const credential = await currentApplication.serviceCredentials.authenticate(key);

    if (credential == null) {
      throw new UnauthorizedError("Invalid Service Credential");
    }

    const rateLimitResult = await rateLimitApiV1(key);
    if (!rateLimitResult.success) {
      throw new RateLimitError("Rate limit exceeded");
    }

    return await handler({ request, key, credential });
  } catch (error) {
    logError(logContext, error);
    return NextResponse.json(toSanitizedErrorResponse(error), { status: getErrorStatusCode(error) });
  }
}
