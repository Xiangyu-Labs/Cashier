import { runTask } from "./runner";
import { logger } from "@/lib/logger";
import { db } from "@/lib/db";
import { taskRuns } from "@/lib/db/schema";
import { forLedger } from "@/lib/db/scoped-query";

interface SubmitTaskOptions {
    type: string;
    title: string;
    ledgerId: string;
    data: unknown;
    queueName?: 'main' | 'api'; // Parameter kept for backward compatibility (ignored internally)
}

export async function submitFlowTask(options: SubmitTaskOptions): Promise<string> {
    const { type, title, ledgerId, data } = options;

    // 1. Create task_run record
    const [run] = await db.insert(taskRuns).values({
        ledgerId,
        type,
        title,
        status: 'running',
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    }).returning();

    const q = forLedger(taskRuns, ledgerId);

    try {
        // 2. Prepare task payload
        const taskData = {
            ...data as object,
            __taskRunId: run.id,
            __ledgerId: ledgerId,
        };

        const taskDefinition = {
            name: type,
            title,
            queueName: 'main' as const, // Ignored
            data: taskData
        };

        // 3. Fire and forget - execute asynchronously
        // We do NOT await this. It runs in the background.
        // Node.js will keep the process alive for this promise in most server environments.
        // In Serverless (Vercel), this might be cut short, but user is on Docker/VPS.
        runTask(taskDefinition).catch(err => {
            logger.error({ err, taskRunId: run.id }, "Unhandled error in background task runner");
        });

        logger.info({ taskRunId: run.id, type }, "Task submitted for background execution");

        return run.id;
    } catch (error) {
        logger.error({ err: error, taskRunId: run.id }, "Failed to submit task");

        // Mark as failed immediately
        await db.update(taskRuns)
            .set({
                status: 'failed',
                error: (error as Error).message,
                completedAt: new Date()
            })
            .where(q.whereId(run.id));

        throw error;
    }
}
