import { type NextRequest, NextResponse } from "next/server";
import { listEntryCategories } from "@/features/ledger/server/actions/categories";
import { handleApiV1Route } from "@/app/api/v1/_shared/route-helper";

export async function GET(request: NextRequest) {
  return handleApiV1Route(request, {
    logContext: "api/v1/categories",
    handler: async ({ credential }) => {
      const categories = await listEntryCategories(credential.ledgerId);
      return NextResponse.json({ categories });
    },
  });
}
