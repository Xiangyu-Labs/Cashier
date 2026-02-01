import { FlowProgress } from "@/lib/flow/types";
import { taskRunRepo } from "@/features/tasks/server/repositories/task-run-repository";

/**
 * Update task run progress in database
 */
export async function updateTaskRunProgress(_taskRunId: string, _progress: FlowProgress): Promise<void> {
    // Progress update logic remains placeholder/optional as discussed
}

export async function completeTaskRun(taskRunId: string, output: unknown, ledgerId?: string): Promise<void> {
    if (!ledgerId) throw new Error("ledgerId is required to complete task run");
    await taskRunRepo.complete(taskRunId, output, ledgerId);
}

export async function failTaskRun(taskRunId: string, error: string, ledgerId?: string): Promise<void> {
    if (!ledgerId) throw new Error("ledgerId is required to fail task run");
    await taskRunRepo.fail(taskRunId, error, ledgerId);
}

export async function recordTaskRunUsage(taskRunId: string, usage: { inputTokens: number; outputTokens: number; totalTokens: number }, ledgerId?: string): Promise<void> {
    await taskRunRepo.recordUsage(taskRunId, usage, ledgerId);
}

export async function incrementTaskRunStats(_taskRunId: string, _type: 'completed' | 'failed'): Promise<void> {
    // Atomic increment would be ideal, leaving placeholder
}

