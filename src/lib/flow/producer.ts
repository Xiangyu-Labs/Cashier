import { getMainQueue, getApiQueue } from "./queues";
import { logger } from "@/lib/logger";
import { db } from "@/lib/db";
import { taskRuns } from "@/lib/db/schema";
import { forLedger } from "@/lib/db/scoped-query";

interface SubmitTaskOptions {
    type: string;
    title: string;
    ledgerId: string;
    data: unknown;
    queueName?: 'main' | 'api';
}

export async function submitFlowTask(options: SubmitTaskOptions): Promise<string> {
    const { type, title, ledgerId, data, queueName = 'main' } = options;

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
        // 2. Add to BullMQ
        const queue = queueName === 'api' ? getApiQueue() : getMainQueue();

        // Explicitly casting data to object to satisfy BullMQ types if needed, though 'unknown' might be strict
        const jobData = {
            ...data as object,
            __taskRunId: run.id,
            __ledgerId: ledgerId,
        };

        const job = await queue.add(type, jobData, {
            // Job options
            attempts: 1,
            removeOnComplete: 100,
            removeOnFail: 500,
        });

        // 3. Update task_run with BullMQ ID
        await db.update(taskRuns)
            .set({ bullFlowId: job.id })
            .where(q.whereId(run.id));

        logger.info({ taskRunId: run.id, bullJobId: job.id, type }, "Task submitted successfully");

        return run.id;
    } catch (error) {
        logger.error({ err: error, taskRunId: run.id }, "Failed to submit task to queue");

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
