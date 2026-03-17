import { db } from "@/lib/db";
import { taskRuns } from "@/lib/db/schema";
import { eq, and, desc, isNull } from "drizzle-orm";
import { z } from "zod";
import type { StorageAdapter, TaskInput, TaskRecord, TaskFilter } from "../types";

// Zod schemas for runtime validation of database values
const TaskStatusSchema = z.enum(["pending", "running", "completed", "failed", "cancelled"]);

// TokenUsageRecord is an index signature type: { [model: string]: { input: number; output: number } }
// Using catchall for index signature validation
const TokenUsageEntrySchema = z.object({
  input: z.number(),
  output: z.number(),
});
const TokenUsageSchema = z.record(z.string(), TokenUsageEntrySchema);

// Inferred types from schemas (for type safety without assertions)
type ValidatedTaskStatus = z.infer<typeof TaskStatusSchema>;
type ValidatedTokenUsage = z.infer<typeof TokenUsageSchema>;

/**
 * Create a Drizzle-based storage adapter for the Flow Engine
 *
 * This adapter uses the existing taskRuns table schema and provides
 * the storage interface required by the Flow Engine.
 */
export function createDrizzleStorage(): StorageAdapter {
  return {
    async create(task: TaskInput): Promise<string> {
      const [record] = await db
        .insert(taskRuns)
        .values({
          type: task.type,
          title: task.title ?? task.type,
          status: "pending",
          input: task.input, // Framework-enforced complete storage
          scopeId: task.scopeId ?? null,
          entityType: task.entityType ?? null,
          entityId: task.entityId ?? null,
        })
        .returning({ id: taskRuns.id });

      return record.id;
    },

    async update(id: string, data: Partial<TaskRecord>): Promise<void> {
      const updateData: Record<string, unknown> = {
        updatedAt: new Date(), // Always update timestamp on any change
      };

      if (data.status !== undefined) {
        updateData.status = data.status;
      }
      if (data.progress !== undefined) {
        updateData.progress = data.progress;
      }
      if (data.error !== undefined) {
        updateData.error = data.error;
      }
      if (data.tokenUsage !== undefined) {
        updateData.tokenUsage = data.tokenUsage;
      }
      if (data.title !== undefined) {
        updateData.title = data.title;
      }

      // Set completedAt for terminal states
      if (data.status === "completed" || data.status === "failed" || data.status === "cancelled") {
        updateData.completedAt = new Date();
      }

      // Set startedAt when transitioning to running
      if (data.status === "running") {
        updateData.startedAt = new Date();
      }

      await db
        .update(taskRuns)
        .set(updateData)
        .where(and(eq(taskRuns.id, id), isNull(taskRuns.deletedAt)));
    },

    async get(id: string): Promise<TaskRecord | null> {
      const record = await db.query.taskRuns.findFirst({
        where: eq(taskRuns.id, id),
      });

      if (!record) {
        return null;
      }

      return mapToTaskRecord(record);
    },

    async list(filter?: TaskFilter): Promise<TaskRecord[]> {
      const conditions: ReturnType<typeof eq>[] = [];

      if (filter?.type) {
        conditions.push(eq(taskRuns.type, filter.type));
      }
      if (filter?.status) {
        conditions.push(eq(taskRuns.status, filter.status));
      }

      const query = db
        .select()
        .from(taskRuns)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(taskRuns.createdAt));

      if (filter?.limit) {
        query.limit(filter.limit);
      }
      if (filter?.offset) {
        query.offset(filter.offset);
      }

      const records = await query;

      return records.map(mapToTaskRecord);
    },
  };
}

/**
 * Map database record to TaskRecord interface with runtime validation
 *
 * Uses Zod schemas to validate status and tokenUsage from database,
 * preventing invalid values from propagating through the application.
 */
function mapToTaskRecord(record: typeof taskRuns.$inferSelect): TaskRecord {
  // Validate status with fallback to 'failed' if invalid
  const statusResult = TaskStatusSchema.safeParse(record.status);
  const validatedStatus: ValidatedTaskStatus = statusResult.success ? statusResult.data : "failed";

  if (!statusResult.success) {
    console.error(
      `[TaskStorage] Invalid task status "${record.status}" for task ${record.id}, defaulting to 'failed'`
    );
  }

  // Validate tokenUsage if present
  let validatedTokenUsage: ValidatedTokenUsage | null = null;
  if (record.tokenUsage) {
    const tokenResult = TokenUsageSchema.safeParse(record.tokenUsage);
    if (tokenResult.success) {
      validatedTokenUsage = tokenResult.data;
    } else {
      console.error(`[TaskStorage] Invalid tokenUsage for task ${record.id}:`, record.tokenUsage);
    }
  }

  return {
    id: record.id,
    type: record.type,
    title: record.title,
    status: validatedStatus,
    progress: record.progress ?? null,
    input: record.input,
    error: record.error,
    tokenUsage: validatedTokenUsage,
    scopeId: record.scopeId ?? null,
    entityType: record.entityType ?? null,
    entityId: record.entityId ?? null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}
