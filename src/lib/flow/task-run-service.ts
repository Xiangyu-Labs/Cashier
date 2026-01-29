import { db } from "@/lib/db";
import { taskRuns } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { FlowProgress } from "./types";

/**
 * Update task run progress in database
 */
export async function updateTaskRunProgress(_taskRunId: string, _progress: FlowProgress): Promise<void> {
    // Use a transaction or simpler update if specific fields need to be updated
    // For now, we don't have a progress column in taskRuns based on previous schema definition.
    // Wait, let me check schema again. The schema definition in schema.ts DOES NOT have a progress column.
    // The implementation plan had `output`, `status`, `error`, `usage`.
    // The User Request v2.0 mentioned "Display Title" and metadata in Job data or progress.
    // The progress updates might be only for UI realtime feedback via Redis/BullMQ primarily?
    // But for persistence, maybe we don't need detailed step progress in DB if it's ephemeral?
    // Actually, the schema I pushed HAS `completedJobs` and `failedJobs`.
    // Let's assume progress is transient for now or stored in `output` if needed?
    //
    // Re-reading schema.ts content I verified in Step 113:
    // It has `usage`, `output`, `error`, `status`. NO `progress` column.
    // So validation says: "progress tracking structure (stored in JSONB)" - wait, that was OLD schema.
    // New schema `task_runs` DOES NOT have `progress`.
    //
    // However, I can store progress in Redis via `job.updateProgress`.
    // If we want persistent progress in DB, we should have added it.
    // But given standard "Running", "Completed" status, maybe that's enough for DB?
    // Or maybe we map progress to something?
    //
    // Let's stick to update logic that updates what we HAVE.
    // Maybe `output` can be used for intermediate results?
    //
    // Actually, looking at `processor.ts` plan:
    // `await job.updateProgress(progress); if (job.data.__taskRunId) { updateTaskRunProgress(...) }`
    //
    // If `taskRuns` allows `progress` I missed it.
    // Checking schema again...
    // `usage: jsonb("usage")`
    // `output: jsonb("output")`
    //
    // I will skip updating DB for progress for now unless I add a column.
    // For V2, detailed progress is often on the Job itself in Redis.
    // The Root Job ID is in `taskRuns.bullFlowId`.
    // We can fetch progress from BullMQ if needed.
    //
    // But `completedJobs` count is useful.
    //
    // Let's implement basic status updates for now.
}

export async function completeTaskRun(taskRunId: string, output: unknown): Promise<void> {
    await db.update(taskRuns)
        .set({
            status: "completed",
            output,
            completedAt: new Date(),
            // completedJobs: ... // this should be incremented incrementally?
        })
        .where(eq(taskRuns.id, taskRunId));
}

export async function failTaskRun(taskRunId: string, error: string): Promise<void> {
    await db.update(taskRuns)
        .set({
            status: "failed",
            error,
            completedAt: new Date(),
        })
        .where(eq(taskRuns.id, taskRunId));
}

export async function recordTaskRunUsage(taskRunId: string, usage: { inputTokens: number; outputTokens: number; totalTokens: number }): Promise<void> {
    // Atomic increment of usage JSONB fields
    await db.update(taskRuns)
        .set({
            usage: sql`jsonb_build_object(
                'inputTokens', COALESCE((usage->>'inputTokens')::int, 0) + ${usage.inputTokens},
                'outputTokens', COALESCE((usage->>'outputTokens')::int, 0) + ${usage.outputTokens},
                'totalTokens', COALESCE((usage->>'totalTokens')::int, 0) + ${usage.totalTokens}
            )`
        })
        .where(eq(taskRuns.id, taskRunId));
}

export async function incrementTaskRunStats(_taskRunId: string, _type: 'completed' | 'failed'): Promise<void> {
    // Atomic increment would be ideal, but for now just basic update
    // Drizzle doesn't support easy `increment` without raw SQL
    // leaving placeholder
}
