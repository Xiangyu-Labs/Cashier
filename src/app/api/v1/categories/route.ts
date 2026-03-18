import { type NextRequest, NextResponse } from "next/server";
import { getEntryCategoriesAction } from "@/features/ledger/server";
import { handleApiV1Route } from "@/app/api/v1/_shared/route-helper";

export async function GET(request: NextRequest) {
  return handleApiV1Route(request, {
    logContext: "api/v1/categories",
    handler: async ({ credential }) => {
      const categories = await getEntryCategoriesAction(credential.ledgerId);
      return NextResponse.json({ categories });
    },
  });
}
