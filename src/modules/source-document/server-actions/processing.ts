"use server";
import { withLedgerAccess } from "@/modules/ledger/access";
import type { ProcessingStatsDto, ProcessingTaskDto } from "@/modules/source-document/contracts";
import {
  processingTasksQuerySchema,
  type ProcessingTasksQueryInput,
} from "@/modules/source-document/contract-schemas";
import {
  getProcessingStats,
  listProcessingTasks,
} from "../application/queries/source-document-processing";

export const getProcessingTasksAction = withLedgerAccess(
  async (ledgerId: string, params: ProcessingTasksQueryInput): Promise<ProcessingTaskDto[]> => {
    const validated = processingTasksQuerySchema.parse(params);
    return listProcessingTasks(ledgerId, validated);
  }
);

export const getProcessingStatsAction = withLedgerAccess(
  async (ledgerId: string): Promise<ProcessingStatsDto> => getProcessingStats(ledgerId)
);
