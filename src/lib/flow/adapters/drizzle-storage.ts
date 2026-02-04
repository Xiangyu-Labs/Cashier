import { db } from '@/lib/db'
import { taskRuns } from '@/lib/db/schema'
import { eq, and, desc } from 'drizzle-orm'
import type {
  StorageAdapter,
  TaskInput,
  TaskRecord,
  TaskFilter,
  TokenUsageRecord,
} from '../types'

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
          ledgerId: task.ledgerId,
          status: 'pending',
          // Store input in output field temporarily (will be replaced on completion)
          // Note: Consider adding a separate 'input' column if needed
        })
        .returning({ id: taskRuns.id })

      return record.id
    },

    async update(id: string, data: Partial<TaskRecord>): Promise<void> {
      const updateData: Record<string, unknown> = {
        updatedAt: new Date(), // Always update timestamp on any change
      }

      if (data.status !== undefined) {
        updateData.status = data.status
      }
      if (data.progress !== undefined) {
        updateData.progress = data.progress
      }
      if (data.result !== undefined) {
        updateData.output = data.result
      }
      if (data.error !== undefined) {
        updateData.error = data.error
      }
      if (data.tokenUsage !== undefined) {
        updateData.tokenUsage = data.tokenUsage
      }
      if (data.title !== undefined) {
        updateData.title = data.title
      }

      // Set completedAt for terminal states
      if (data.status === 'completed' || data.status === 'failed' || data.status === 'cancelled') {
        updateData.completedAt = new Date()
      }

      // Set startedAt when transitioning to running
      if (data.status === 'running') {
        updateData.startedAt = new Date()
      }

      await db
        .update(taskRuns)
        .set(updateData)
        .where(eq(taskRuns.id, id))
    },

    async get(id: string): Promise<TaskRecord | null> {
      const record = await db.query.taskRuns.findFirst({
        where: eq(taskRuns.id, id),
      })

      if (!record) {
        return null
      }

      return mapToTaskRecord(record)
    },

    async list(filter?: TaskFilter): Promise<TaskRecord[]> {
      const conditions: ReturnType<typeof eq>[] = []

      if (filter?.type) {
        conditions.push(eq(taskRuns.type, filter.type))
      }
      if (filter?.status) {
        conditions.push(eq(taskRuns.status, filter.status))
      }
      if (filter?.ledgerId) {
        conditions.push(eq(taskRuns.ledgerId, filter.ledgerId))
      }

      const query = db
        .select()
        .from(taskRuns)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(taskRuns.createdAt))

      if (filter?.limit) {
        query.limit(filter.limit)
      }
      if (filter?.offset) {
        query.offset(filter.offset)
      }

      const records = await query

      return records.map(mapToTaskRecord)
    },
  }
}

/**
 * Map database record to TaskRecord interface
 */
function mapToTaskRecord(record: typeof taskRuns.$inferSelect): TaskRecord {
  return {
    id: record.id,
    type: record.type,
    title: record.title,
    status: record.status as TaskRecord['status'],
    progress: record.progress ?? null,
    result: record.output,
    error: record.error,
    tokenUsage: record.tokenUsage as TokenUsageRecord | null,
    ledgerId: record.ledgerId,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  }
}
