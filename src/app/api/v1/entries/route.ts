import { type NextRequest, NextResponse } from "next/server";
import { listLedgerEntries } from "@/modules/ledger/actions";
import { handleApiV1Route } from "@/app/api/v1/_shared/route-helper";
import { parseApiInput } from "@/app/api/v1/_shared/validation";
import { listLedgerEntriesInputSchema } from "@/modules/ledger/contract-schemas";

export async function GET(request: NextRequest) {
  return handleApiV1Route(request, {
    logContext: "api/v1/entries",
    handler: async ({ credential, request: authorizedRequest }) => {
      const { searchParams } = new URL(authorizedRequest.url);
      const params = parseApiInput(listLedgerEntriesInputSchema, {
        startDate: searchParams.get("startDate") ?? undefined,
        endDate: searchParams.get("endDate") ?? undefined,
        categoryId: searchParams.get("categoryId") ?? undefined,
        currency: searchParams.get("currency") ?? undefined,
        cursor: searchParams.get("cursor") ?? undefined,
        limit: searchParams.get("limit") ?? undefined,
      });

      const result = await listLedgerEntries(credential.ledgerId, {
        startDate: params.startDate,
        endDate: params.endDate,
        categoryId: params.categoryId,
        currency: params.currency,
        limit: params.limit,
        cursor: params.cursor,
      });

      return NextResponse.json(result);
    },
  });
}
