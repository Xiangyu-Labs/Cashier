import { type NextRequest, NextResponse } from "next/server";
import { handleApiV1Route } from "@/app/api/v1/_shared/route-helper";
import { parseApiInput } from "@/app/api/v1/_shared/validation";
import { ledgerStatsQuerySchema } from "@/modules/ledger/contract-schemas";
import { omitNullishProperties } from "@/lib/validation";
import { calculateLedgerStats } from "@/modules/ledger/queries";

export async function GET(request: NextRequest) {
  return handleApiV1Route(request, {
    logContext: "api/v1/stats",
    handler: async ({ credential, request: authorizedRequest }) => {
      const { searchParams } = new URL(authorizedRequest.url);
      const rawParams = omitNullishProperties({
        startDate: searchParams.get("startDate"),
        endDate: searchParams.get("endDate"),
        categoryId: searchParams.get("categoryId"),
        currency: searchParams.get("currency"),
      });
      const params = parseApiInput(ledgerStatsQuerySchema, rawParams);

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
