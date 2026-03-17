import { type NextRequest, NextResponse } from "next/server";
import { validateServiceCredential } from "@/features/ledger/server/actions/credentials";
import { getLedgerStatsAction } from "@/features/ledger/server/actions/stats";
import { rateLimitApiV1 } from "@/lib/ratelimit";
import { UnauthorizedError, RateLimitError } from "@/lib/errors";
import { toErrorResponse, getErrorStatusCode, logError } from "@/lib/error-handlers";
import { z } from "zod";

const querySchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  categoryId: z.string().uuid().optional(),
  currency: z.string().length(3).optional(),
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
    });

    // 4. 查询统计数据
    const result = await getLedgerStatsAction(
      credential.ledgerId,
      params.startDate,
      params.endDate,
      undefined, // mainCurrency - 使用账本默认
      {
        categoryId: params.categoryId ?? null,
        currency: params.currency ?? null,
      }
    );

    return NextResponse.json(result);
  } catch (error) {
    logError("api/v1/stats", error);
    return NextResponse.json(
      toErrorResponse(error),
      { status: getErrorStatusCode(error) }
    );
  }
}
