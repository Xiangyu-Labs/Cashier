import { type NextRequest, NextResponse } from "next/server";
import { validateServiceCredential } from "@/features/ledger/server/actions/credentials";
import { rateLimitApiV1 } from "@/lib/ratelimit";
import { UnauthorizedError, RateLimitError } from "@/lib/errors";
import { getErrorStatusCode, logError, toErrorResponse } from "@/lib/error-handlers";

type ServiceCredential = NonNullable<Awaited<ReturnType<typeof validateServiceCredential>>>;

interface ApiV1Context {
  credential: ServiceCredential;
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
    const credential = await validateServiceCredential(key);

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
    return NextResponse.json(toErrorResponse(error), { status: getErrorStatusCode(error) });
  }
}
