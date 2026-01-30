import { db } from "@/lib/db";
import { taskRuns } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { FlowProgress } from "./types";
import { taskRunRepo } from "@/lib/repositories";

/**
 * Update task run progress in database
 */
export async function updateTaskRunProgress(_taskRunId: string, _progress: FlowProgress): Promise<void> {
    // Progress update logic remains placeholder/optional as discussed
}

export async function completeTaskRun(taskRunId: string, output: unknown): Promise<void> {
    await taskRunRepo.complete(taskRunId, output);
}

export async function failTaskRun(taskRunId: string, error: string): Promise<void> {
    await taskRunRepo.fail(taskRunId, error);
}

export async function recordTaskRunUsage(taskRunId: string, usage: { inputTokens: number; outputTokens: number; totalTokens: number }): Promise<void> {
    await taskRunRepo.recordUsage(taskRunId, usage);
}

export async function incrementTaskRunStats(_taskRunId: string, _type: 'completed' | 'failed'): Promise<void> {
    // Atomic increment would be ideal, leaving placeholder
}

