import { type NextRequest, NextResponse } from "next/server";
import { listLedgerEntries } from "@/modules/ledger/actions";
import { z } from "zod";
import { optionalDateStringSchema } from "@/lib/validation";
import { handleApiV1Route } from "@/app/api/v1/_shared/route-helper";
import { parseApiInput } from "@/app/api/v1/_shared/validation";

const querySchema = z.object({
  startDate: optionalDateStringSchema,
  endDate: optionalDateStringSchema,
  categoryId: z.string().uuid().optional(),
  currency: z.string().length(3).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
});

export async function GET(request: NextRequest) {
  return handleApiV1Route(request, {
    logContext: "api/v1/entries",
    handler: async ({ credential, request: authorizedRequest }) => {
      const { searchParams } = new URL(authorizedRequest.url);
      const params = parseApiInput(querySchema, {
        startDate: searchParams.get("startDate") ?? undefined,
        endDate: searchParams.get("endDate") ?? undefined,
        categoryId: searchParams.get("categoryId") ?? undefined,
        currency: searchParams.get("currency") ?? undefined,
        cursor: searchParams.get("cursor") ?? undefined,
        limit: searchParams.get("limit") ?? undefined,
      });

      const result = await listLedgerEntries(credential.ledgerId, {
        startDate: params.startDate ?? null,
        endDate: params.endDate ?? null,
        categoryId: params.categoryId ?? null,
        currency: params.currency ?? null,
        limit: params.limit,
        cursor: params.cursor ?? null,
      });

      return NextResponse.json(result);
    },
  });
}
