import { BaseRepository } from "./base-repository";
import { taskRuns } from "@/lib/db/schema";
import { InferSelectModel, sql, eq } from "drizzle-orm";
import { eventBus } from "@/lib/events/event-bus";

export type TaskRun = InferSelectModel<typeof taskRuns>;

class TaskRunRepository extends BaseRepository<TaskRun, typeof taskRuns> {
    constructor() {
        super(taskRuns, 'task_run');
    }

    async fail(id: string, error: string, ledgerId?: string) {
        return this.update(id, {
            status: 'failed',
            error,
            completedAt: new Date()
        }, ledgerId);
    }

    async complete(id: string, output: unknown, ledgerId?: string) {
        return this.update(id, {
            status: 'completed',
            output: output as any, // jsonb casting
            completedAt: new Date()
        }, ledgerId);
    }

    async recordUsage(id: string, usage: { inputTokens: number; outputTokens: number; totalTokens: number }, ledgerId?: string) {
        // Usage update uses raw SQL, so we can't easily use the base update method which expects a partial object
        // We override this specific method

        await this.db.update(taskRuns)
            .set({
                usage: sql`jsonb_build_object(
                    'inputTokens', COALESCE((usage->>'inputTokens')::int, 0) + ${usage.inputTokens},
                    'outputTokens', COALESCE((usage->>'outputTokens')::int, 0) + ${usage.outputTokens},
                    'totalTokens', COALESCE((usage->>'totalTokens')::int, 0) + ${usage.totalTokens}
                )`
            })
            .where(eq(taskRuns.id, id));

        // Manually publish update event if ledgerId is provided
        if (ledgerId) {
            eventBus.publish({
                type: 'entity:changed',
                ledgerId: ledgerId,
                entity: this.entityType,
                action: 'updated',
                ids: [id]
            });
        }
    }
}

export const taskRunRepo = new TaskRunRepository();
