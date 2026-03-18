import { type NextRequest, NextResponse } from "next/server";
import { validateServiceCredential } from "@/features/ledger/server/actions/credentials";
import { getLedgerEntriesAction } from "@/features/ledger/server/actions/entries";
import { rateLimitApiV1 } from "@/lib/ratelimit";
import { UnauthorizedError, RateLimitError } from "@/lib/errors";
import { toErrorResponse, getErrorStatusCode, logError } from "@/lib/error-handlers";
import { z } from "zod";
import { optionalDateStringSchema } from "@/lib/validation";

const querySchema = z.object({
  startDate: optionalDateStringSchema,
  endDate: optionalDateStringSchema,
  categoryId: z.string().uuid().optional(),
  currency: z.string().length(3).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
});

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

    // 3. 解析查询参数
    const { searchParams } = new URL(request.url);
    const params = querySchema.parse({
      startDate: searchParams.get("startDate") ?? undefined,
      endDate: searchParams.get("endDate") ?? undefined,
      categoryId: searchParams.get("categoryId") ?? undefined,
      currency: searchParams.get("currency") ?? undefined,
      cursor: searchParams.get("cursor") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
    });

    // 4. 查询数据
    const result = await getLedgerEntriesAction(credential.ledgerId, {
      startDate: params.startDate ?? null,
      endDate: params.endDate ?? null,
      categoryId: params.categoryId ?? null,
      currency: params.currency ?? null,
      limit: params.limit,
      cursor: params.cursor ?? null,
    });

    return NextResponse.json(result);
  } catch (error) {
    logError("api/v1/entries", error);
    return NextResponse.json(
      toErrorResponse(error),
      { status: getErrorStatusCode(error) }
    );
  }
}
