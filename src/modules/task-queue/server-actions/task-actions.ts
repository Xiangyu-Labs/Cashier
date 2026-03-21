"use server";
import { requireLedgerAccess, withLedgerAccess } from "@/modules/ledger/access";
import { getTaskQueueQuery } from "../application/queries/get-task-queue";
import {
  batchCancelTasksUseCase,
  cancelTaskUseCase,
} from "../application/use-cases/cancel-task";
import {
  batchDismissTasksUseCase,
  dismissTaskUseCase,
} from "../application/use-cases/dismiss-task";
import type { TaskQueueResult } from "../contracts";

export const cancelTaskAction = withLedgerAccess((ledgerId: string, taskId: string) =>
  cancelTaskUseCase(ledgerId, taskId)
);

export const batchCancelTasksAction = withLedgerAccess((ledgerId: string, taskIds: string[]) =>
  batchCancelTasksUseCase(ledgerId, taskIds)
);

export const dismissTaskAction = withLedgerAccess((ledgerId: string, taskId: string) =>
  dismissTaskUseCase(ledgerId, taskId)
);

export const batchDismissTasksAction = withLedgerAccess((ledgerId: string, taskIds: string[]) =>
  batchDismissTasksUseCase(ledgerId, taskIds)
);

export async function getTaskQueueForAuthorizedLedger(
  ledgerId: string
): Promise<TaskQueueResult> {
  await requireLedgerAccess(ledgerId);
  return getTaskQueueQuery(ledgerId);
}

export const getTaskQueueAction = withLedgerAccess((ledgerId: string) =>
  getTaskQueueQuery(ledgerId)
);
