import { type NextRequest, NextResponse } from "next/server";
import { handleApiV1Route } from "@/app/api/v1/_shared/route-helper";
import type { CategoriesResponseDto } from "@/modules/ledger/contracts";
import { listEntryCategories } from "@/modules/ledger/queries";

export async function GET(request: NextRequest) {
  return handleApiV1Route(request, {
    logContext: "api/v1/categories",
    handler: async ({ credential }) => {
      const categories = await listEntryCategories(credential.ledgerId);
      const response: CategoriesResponseDto = { categories };
      return NextResponse.json(response);
    },
  });
}
