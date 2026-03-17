import { type NextRequest, NextResponse } from "next/server";
import { validateServiceCredential } from "@/features/ledger/server/actions/credentials";
import { getEntryCategoriesAction } from "@/features/ledger/server/actions/categories";
import { rateLimitApiV1 } from "@/lib/ratelimit";
import { UnauthorizedError, RateLimitError } from "@/lib/errors";
import { toErrorResponse, getErrorStatusCode, logError } from "@/lib/error-handlers";

export async function GET(request: NextRequest) {
  try {
    // 1. 认证
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      throw new UnauthorizedError("Missing or invalid Authorization header");
    }

    const key = authHeader.split(" ")[1];
    const credential = await validateServiceCredential(key);
    if (!credential) {
      throw new UnauthorizedError("Invalid Service Credential");
    }

    // 2. 限流
    const rateLimitResult = await rateLimitApiV1(key);
    if (!rateLimitResult.success) {
      throw new RateLimitError("Rate limit exceeded");
    }

    // 3. 查询分类列表
    const categories = await getEntryCategoriesAction(credential.ledgerId);

    return NextResponse.json({ categories });
  } catch (error) {
    logError("api/v1/categories", error);
    return NextResponse.json(
      toErrorResponse(error),
      { status: getErrorStatusCode(error) }
    );
  }
}
