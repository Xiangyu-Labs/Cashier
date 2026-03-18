import { type NextRequest, NextResponse } from "next/server";
import { calculateLedgerStats } from "@/features/ledger/server";
import { z } from "zod";
import { optionalDateStringSchema } from "@/lib/validation";
import { handleApiV1Route } from "@/app/api/v1/_shared/route-helper";
import { parseApiInput } from "@/app/api/v1/_shared/validation";

const querySchema = z.object({
  startDate: optionalDateStringSchema,
  endDate: optionalDateStringSchema,
  categoryId: z.string().uuid().optional(),
  currency: z.string().length(3).optional(),
});

export async function GET(request: NextRequest) {
  return handleApiV1Route(request, {
    logContext: "api/v1/stats",
    handler: async ({ credential, request: authorizedRequest }) => {
      const { searchParams } = new URL(authorizedRequest.url);
      const params = parseApiInput(querySchema, {
        startDate: searchParams.get("startDate") ?? undefined,
        endDate: searchParams.get("endDate") ?? undefined,
        categoryId: searchParams.get("categoryId") ?? undefined,
        currency: searchParams.get("currency") ?? undefined,
      });

      const result = await calculateLedgerStats(
        credential.ledgerId,
        params.startDate,
        params.endDate,
        undefined,
        {
          categoryId: params.categoryId ?? null,
          currency: params.currency ?? null,
        }
      );

      return NextResponse.json(result);
    },
  });
}
