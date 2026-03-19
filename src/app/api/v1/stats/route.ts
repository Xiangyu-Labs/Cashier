import { type NextRequest, NextResponse } from "next/server";
import { calculateLedgerStats } from "@/modules/ledger/actions";
import { handleApiV1Route } from "@/app/api/v1/_shared/route-helper";
import { parseApiInput } from "@/app/api/v1/_shared/validation";
import { ledgerStatsQuerySchema } from "@/modules/ledger/contract-schemas";

export async function GET(request: NextRequest) {
  return handleApiV1Route(request, {
    logContext: "api/v1/stats",
    handler: async ({ credential, request: authorizedRequest }) => {
      const { searchParams } = new URL(authorizedRequest.url);
      const params = parseApiInput(ledgerStatsQuerySchema, {
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
