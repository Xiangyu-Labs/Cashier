import { type NextRequest, NextResponse } from "next/server";
import { handleApiV1Route } from "@/app/api/v1/_shared/route-helper";
import { getTaskQueueAction } from "@/features/task-queue/server/actions/task-queue";

export async function GET(request: NextRequest) {
  return handleApiV1Route(request, {
    logContext: "api/v1/task/items",
    handler: async ({ credential }) => {
      const result = await getTaskQueueAction(credential.ledgerId);
      return NextResponse.json({ items: result.items });
    },
  });
}
