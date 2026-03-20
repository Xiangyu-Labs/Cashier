import { type NextRequest, NextResponse } from "next/server";
import { listLedgerEntries } from "@/modules/ledger/actions";
import { handleApiV1Route } from "@/app/api/v1/_shared/route-helper";
import { parseApiInput } from "@/app/api/v1/_shared/validation";
import { listLedgerEntriesInputSchema } from "@/modules/ledger/contract-schemas";
import { omitNullishProperties } from "@/lib/validation";

export async function GET(request: NextRequest) {
  return handleApiV1Route(request, {
    logContext: "api/v1/entries",
    handler: async ({ credential, request: authorizedRequest }) => {
      const { searchParams } = new URL(authorizedRequest.url);
      const rawParams = omitNullishProperties({
        startDate: searchParams.get("startDate"),
        endDate: searchParams.get("endDate"),
        categoryId: searchParams.get("categoryId"),
        currency: searchParams.get("currency"),
        minAmount: searchParams.get("minAmount"),
        maxAmount: searchParams.get("maxAmount"),
        cursor: searchParams.get("cursor"),
        limit: searchParams.get("limit"),
      });
      const params = parseApiInput(listLedgerEntriesInputSchema, rawParams);

      const result = await listLedgerEntries(credential.ledgerId, params);

      return NextResponse.json(result);
    },
  });
}
