import { type NextRequest, NextResponse } from "next/server";
import { handleApiV1Route } from "@/app/api/v1/_shared/route-helper";
import { getTaskQueueForAuthorizedLedger } from "@/modules/task-queue/actions";
import type { TaskQueueStatsResponseDto } from "@/modules/task-queue/contracts";

export async function GET(request: NextRequest) {
  return handleApiV1Route(request, {
    logContext: "api/v1/task/stats",
    handler: async ({ credential }) => {
      const result = await getTaskQueueForAuthorizedLedger(credential.ledgerId);
      const response: TaskQueueStatsResponseDto = { stats: result.stats };
      return NextResponse.json(response);
    },
  });
}
