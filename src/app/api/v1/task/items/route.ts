import { type NextRequest, NextResponse } from "next/server";
import { handleApiV1Route } from "@/app/api/v1/_shared/route-helper";
import {
  getTaskQueueForAuthorizedLedger,
  type TaskQueueItemsResponseDto,
} from "@/modules/task-queue/actions";

export async function GET(request: NextRequest) {
  return handleApiV1Route(request, {
    logContext: "api/v1/task/items",
    handler: async ({ credential }) => {
      const result = await getTaskQueueForAuthorizedLedger(credential.ledgerId);
      const response: TaskQueueItemsResponseDto = { items: result.items };
      return NextResponse.json(response);
    },
  });
}
