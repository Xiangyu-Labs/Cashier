import { describe, it, expect, beforeEach } from 'vitest'
import { createFlowEngine } from '@/lib/flow/engine'
import type { StorageAdapter, TaskRecord, TaskInput, FlowTaskHandler } from '@/lib/flow/types'

function createMemoryStorage(): StorageAdapter & { tasks: Map<string, TaskRecord>; clear(): void } {
  const tasks = new Map<string, TaskRecord>()
  let idCounter = 1

  return {
    tasks,
    clear() {
      tasks.clear()
      idCounter = 1
    },
    async create(task: TaskInput): Promise<string> {
      const id = `task-${idCounter++}`
      tasks.set(id, {
        id,
        type: task.type,
        title: task.title ?? null,
        status: 'pending',
        progress: null,
        input: task.input,
        deduplicationKey: task.deduplicationKey ?? null,
        error: null,
        tokenUsage: null,
        scopeId: task.scopeId ?? null,
        entityType: task.entityType ?? null,
        entityId: task.entityId ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
        startedAt: null,
        completedAt: null,
      })
      return id
    },
    async update(id: string, data: Partial<TaskRecord>): Promise<void> {
      const task = tasks.get(id)
      if (task) {
        Object.assign(task, data)
        task.updatedAt = new Date()
      }
    },
    async get(id: string): Promise<TaskRecord | null> {
      return tasks.get(id) ?? null
    },
    async list(filter?: { type?: string; status?: string; limit?: number; offset?: number }): Promise<TaskRecord[]> {
      let result = Array.from(tasks.values())
      if (filter?.type != null) {
        result = result.filter(t => t.type === filter.type)
      }
      if (filter?.status != null) {
        result = result.filter(t => t.status === filter.status)
      }
      return result
    },
  }
}

const testHandler: FlowTaskHandler<{ value: number }, { result: number }> = {
  async execute(input, context) {
    // Add small delay to simulate async work and prevent immediate completion
    await new Promise(resolve => setTimeout(resolve, 50))
    if (context.signal.aborted) {
      throw new Error('Task cancelled')
    }
    return { result: input.value * 2 }
  },
}

describe('Flow Engine Deduplication', () => {
  let storage: ReturnType<typeof createMemoryStorage>
  let engine: ReturnType<typeof createFlowEngine>

  beforeEach(() => {
    storage = createMemoryStorage()
    engine = createFlowEngine({ storage, maxConcurrentTasks: 1 })
    engine.register('test-task', testHandler)
  })

  it('should return existing taskId when duplicate deduplicationKey is submitted', async () => {
    const taskId1 = await engine.submit('test-task', { value: 1 }, {
      deduplicationKey: 'dup-key-1',
    })

    const taskId2 = await engine.submit('test-task', { value: 2 }, {
      deduplicationKey: 'dup-key-1',
    })

    expect(taskId1).toBe(taskId2)
    expect(storage.tasks.size).toBe(1)
    expect(storage.tasks.get(taskId1)?.deduplicationKey).toBe('dup-key-1')
  })

  it('should create separate tasks for different deduplicationKeys', async () => {
    const taskId1 = await engine.submit('test-task', { value: 1 }, {
      deduplicationKey: 'key-1',
    })

    const taskId2 = await engine.submit('test-task', { value: 2 }, {
      deduplicationKey: 'key-2',
    })

    expect(taskId1).not.toBe(taskId2)
    expect(storage.tasks.size).toBe(2)
  })

  it('should allow duplicate submission after task completes', async () => {
    // First submission
    const taskId1 = await engine.submit('test-task', { value: 1 }, {
      deduplicationKey: 'key-3',
    })

    // Simulate task completion
    await storage.update(taskId1, { status: 'completed' })

    // Second submission with same key should create new task
    // Implementation only checks pending/running tasks, not completed
    const taskId2 = await engine.submit('test-task', { value: 2 }, {
      deduplicationKey: 'key-3',
    })

    expect(taskId1).not.toBe(taskId2) // New task created after completion
    expect(storage.tasks.size).toBe(2)
  })
})
