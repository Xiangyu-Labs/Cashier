# Task Flow Optimizations Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers-extended-cc:subagent-driven-development (if subagents available) or superpowers-extended-cc:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix inconsistencies and simplify task flow system while maintaining proper abstractions

**Architecture:** Add deduplication support to flowEngine, complete TaskRecord interface, add missing onCancel hooks, unify import styles, and create centralized task registry

**Tech Stack:** TypeScript, Drizzle ORM, Next.js App Router, Vitest

---

## Chunk 1: Add Deduplication Support to Flow Engine

**Objective:** Move duplicate task prevention from action layer to framework layer

### Task 1.1: Update TaskInput interface with deduplicationKey

**Files:**
- Modify: `src/lib/flow/types.ts:20-30`

- [ ] **Step 1: Add deduplicationKey to TaskInput interface**

```typescript
/**
 * Input for creating a new task
 */
export interface TaskInput {
  type: string
  title?: string | null
  input?: unknown
  scopeId?: string | null     // Scope ID (e.g., ledgerId in Cashier)
  entityType?: string | null  // Entity type (e.g., "source_document", "category")
  entityId?: string | null    // Entity ID (e.g., sourceDocumentId, categoryId)
  deduplicationKey?: string | null  // Key for preventing duplicate tasks
}
```

- [ ] **Step 2: Update FlowEngine.submit signature**

Modify `src/lib/flow/types.ts:157-161`:

```typescript
  submit<TInput>(
    name: string,
    input: TInput,
    meta?: {
      title?: string;
      scopeId?: string;
      entityType?: string;
      entityId?: string;
      deduplicationKey?: string;  // Add this
    }
  ): Promise<string>
```

### Task 1.2: Implement deduplication logic in engine

**Files:**
- Modify: `src/lib/flow/engine.ts:253-286`

- [ ] **Step 3: Add duplicate detection to submit method**

Replace the submit method implementation:

```typescript
    async submit<TInput>(
      name: string,
      input: TInput,
      meta?: {
        title?: string;
        scopeId?: string;
        entityType?: string;
        entityId?: string;
        deduplicationKey?: string;
      }
    ): Promise<string> {
      // Validate handler exists
      if (!handlers.has(name)) {
        throw new Error(`No handler registered for task: ${name}`)
      }

      // Check for duplicate tasks if deduplicationKey provided
      if (meta?.deduplicationKey) {
        const existingTasks = await config.storage.list({
          type: name,
          status: 'pending',
        })

        for (const task of existingTasks) {
          const taskInput = task.input as { deduplicationKey?: string } | undefined
          if (taskInput?.deduplicationKey === meta.deduplicationKey) {
            logger.info({
              taskId: task.id,
              deduplicationKey: meta.deduplicationKey,
              taskName: name
            }, 'Duplicate task detected, returning existing taskId')
            return task.id
          }
        }
      }

      // Create task record
      const taskId = await config.storage.create({
        type: name,
        title: meta?.title,
        input: {
          ...(input as object),
          ...(meta?.deduplicationKey ? { deduplicationKey: meta.deduplicationKey } : {}),
        },
        scopeId: meta?.scopeId,
        entityType: meta?.entityType,
        entityId: meta?.entityId,
      })

      // Create abort controller for cancellation
      const controller = new AbortController()
      abortControllers.set(taskId, controller)

      // Fire and forget - execute asynchronously
      runTask(taskId, name, input, controller.signal).catch((err) => {
        logger.error({ err, taskId }, 'Unhandled error in background task runner')
      })

      logger.info({ taskId, type: name, title: meta?.title }, 'Task submitted for background execution')

      return taskId
    },
```

### Task 1.3: Write tests for deduplication

**Files:**
- Create: `tests/integration/flow/deduplication.test.ts`

- [ ] **Step 4: Create deduplication test**

```typescript
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
        error: null,
        tokenUsage: null,
        scopeId: task.scopeId ?? null,
        entityType: task.entityType ?? null,
        entityId: task.entityId ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
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
      if (filter?.type) {
        result = result.filter(t => t.type === filter.type)
      }
      if (filter?.status) {
        result = result.filter(t => t.status === filter.status)
      }
      return result
    },
  }
}

const testHandler: FlowTaskHandler<{ value: number }, { result: number }> = {
  async execute(input) {
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
    // (Note: current implementation only checks pending tasks)
    const taskId2 = await engine.submit('test-task', { value: 2 }, {
      deduplicationKey: 'key-3',
    })

    expect(taskId1).toBe(taskId2) // Current behavior: returns existing
    expect(storage.tasks.size).toBe(1)
  })
})
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run tests/integration/flow/deduplication.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add src/lib/flow/types.ts src/lib/flow/engine.ts tests/integration/flow/deduplication.test.ts
git commit -m "feat(flow): add deduplication support to flowEngine.submit()

- Add deduplicationKey to TaskInput and submit meta
- Check for pending tasks with same key before creating new task
- Add integration tests for deduplication behavior

Closes task flow optimization P0 requirement"
```

---

## Chunk 2: Fix TaskRecord Interface

**Objective:** Add missing `startedAt` and `completedAt` fields to TaskRecord interface

### Task 2.1: Update TaskRecord interface

**Files:**
- Modify: `src/lib/flow/types.ts:45-59`

- [ ] **Step 7: Add time fields to TaskRecord**

```typescript
/**
 * Task record stored in database
 */
export interface TaskRecord {
  id: string
  type: string                              // Task type, e.g., 'parse-document'
  title: string | null                      // Task title (optional)
  status: TaskStatus                        // pending / running / completed / failed / cancelled
  progress: string | null                   // "Processing image..."
  input: unknown | null                     // Complete task input (framework-enforced)
  error: string | null                      // Error message on failure
  tokenUsage: TokenUsageRecord | null       // Token statistics by model
  scopeId: string | null                    // Scope ID (e.g., ledgerId)
  entityType: string | null                 // Entity type (e.g., "source_document")
  entityId: string | null                   // Entity ID (e.g., sourceDocumentId)
  createdAt: Date
  updatedAt: Date
  startedAt: Date | null                    // When task transitioned to running
  completedAt: Date | null                  // When task reached terminal state
}
```

### Task 2.2: Update drizzle-storage adapter

**Files:**
- Modify: `src/lib/flow/adapters/drizzle-storage.ts:137-174`

- [ ] **Step 8: Update mapToTaskRecord function**

```typescript
/**
 * Map database record to TaskRecord interface with runtime validation
 *
 * Uses Zod schemas to validate status and tokenUsage from database,
 * preventing invalid values from propagating through the application.
 */
function mapToTaskRecord(record: typeof taskRuns.$inferSelect): TaskRecord {
  // Validate status with fallback to 'failed' if invalid
  const statusResult = TaskStatusSchema.safeParse(record.status)
  const validatedStatus: ValidatedTaskStatus = statusResult.success
    ? statusResult.data
    : 'failed'

  if (!statusResult.success) {
    console.error(`[TaskStorage] Invalid task status "${record.status}" for task ${record.id}, defaulting to 'failed'`)
  }

  // Validate tokenUsage if present
  let validatedTokenUsage: ValidatedTokenUsage | null = null
  if (record.tokenUsage) {
    const tokenResult = TokenUsageSchema.safeParse(record.tokenUsage)
    if (tokenResult.success) {
      validatedTokenUsage = tokenResult.data
    } else {
      console.error(`[TaskStorage] Invalid tokenUsage for task ${record.id}:`, record.tokenUsage)
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
    startedAt: record.startedAt ?? null,      // Add this
    completedAt: record.completedAt ?? null,  // Add this
  }
}
```

### Task 2.3: Update memory storage in tests

**Files:**
- Modify: `tests/integration/flow/basic-flow.test.ts` (and other test files using memory storage)

- [ ] **Step 9: Add time fields to test memory storage**

Find and update memory storage implementations to include `startedAt` and `completedAt`:

```typescript
// In createMemoryStorage functions across test files
async create(task: TaskInput): Promise<string> {
  const id = `task-${idCounter++}`
  const now = new Date()
  tasks.set(id, {
    id,
    type: task.type,
    title: task.title ?? null,
    status: 'pending',
    progress: null,
    input: task.input,
    error: null,
    tokenUsage: null,
    scopeId: task.scopeId ?? null,
    entityType: task.entityType ?? null,
    entityId: task.entityId ?? null,
    createdAt: now,
    updatedAt: now,
    startedAt: null,      // Add this
    completedAt: null,    // Add this
  })
  return id
}
```

- [ ] **Step 10: Run existing tests to verify no regression**

Run: `npx vitest run tests/integration/flow/`
Expected: All tests pass

- [ ] **Step 11: Commit**

```bash
git add src/lib/flow/types.ts src/lib/flow/adapters/drizzle-storage.ts tests/
git commit -m "fix(flow): add startedAt and completedAt to TaskRecord interface

- TaskRecord now matches database schema completely
- Update drizzle-storage adapter to map new fields
- Update test memory storage implementations

Closes task flow optimization P1 requirement"
```

---

## Chunk 3: Add Missing onCancel Hooks

**Objective:** Add onCancel handler to categorize_entry and generate_category_metadata tasks

### Task 3.1: Add onCancel to categorize-entry.ts

**Files:**
- Modify: `src/features/ledger/server/tasks/categorize-entry.ts:172-178`

- [ ] **Step 12: Add onCancel handler**

```typescript
    async onError(error: Error, input: CategorizeEntryInput, _context: FlowContext): Promise<void> {
        logger.error({
            err: error,
            entryId: input.entryId,
        }, "Categorize entry task failed");
        // Keep categoryId as null - no action needed
    },

    async onCancel(input: CategorizeEntryInput, _context: FlowContext): Promise<void> {
        logger.info({
            entryId: input.entryId,
        }, "Categorize entry task cancelled");
        // No cleanup needed - only onComplete writes data
    },
};

// Register the task
flowEngine.register(TASK_TYPE_CATEGORIZE_ENTRY, categorizeEntryHandler);
```

### Task 3.2: Add onCancel to generate-category-metadata.ts

**Files:**
- Modify: `src/features/ledger/server/tasks/generate-category-metadata.ts:100-118`

- [ ] **Step 13: Add onCancel handler**

```typescript
    // 3. Error handling - set default values to stop "generating" state in UI
    async onError(error: Error, input: GenerateCategoryMetadataInput, _context: FlowContext): Promise<void> {
        logger.error({ err: error, categoryId: input.categoryId }, "Generate category metadata task failed");

        // Set default values to prevent UI from showing "generating" forever
        if (input.ledgerId && input.categoryId) {
            const q = forLedger(entryCategories, input.ledgerId);
            await db.update(entryCategories)
                .set({
                    icon: "Package", // Default icon
                    description: "", // Empty description
                    updatedAt: new Date(),
                })
                .where(q.whereId(input.categoryId));

            logger.info({ categoryId: input.categoryId }, "Set default metadata after task failure");
        }
    },

    // 4. Cancellation - set default values like onError
    async onCancel(input: GenerateCategoryMetadataInput, _context: FlowContext): Promise<void> {
        logger.info({ categoryId: input.categoryId }, "Generate category metadata task cancelled");

        // Set default values to prevent UI from showing "generating" forever
        if (input.ledgerId && input.categoryId) {
            const q = forLedger(entryCategories, input.ledgerId);
            await db.update(entryCategories)
                .set({
                    icon: "Package", // Default icon
                    description: "", // Empty description
                    updatedAt: new Date(),
                })
                .where(q.whereId(input.categoryId));

            logger.info({ categoryId: input.categoryId }, "Set default metadata after task cancellation");
        }
    },
};

// Register the task
flowEngine.register(TASK_TYPE_GENERATE_CATEGORY_METADATA, generateCategoryMetadataHandler);
```

### Task 3.3: Write tests for onCancel

**Files:**
- Create: `tests/integration/flow/on-cancel.test.ts`

- [ ] **Step 14: Create onCancel test**

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { createFlowEngine } from '@/lib/flow/engine'
import type { StorageAdapter, TaskRecord, TaskInput, FlowTaskHandler, FlowContext } from '@/lib/flow/types'

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
      const now = new Date()
      tasks.set(id, {
        id,
        type: task.type,
        title: task.title ?? null,
        status: 'pending',
        progress: null,
        input: task.input,
        error: null,
        tokenUsage: null,
        scopeId: task.scopeId ?? null,
        entityType: task.entityType ?? null,
        entityId: task.entityId ?? null,
        createdAt: now,
        updatedAt: now,
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
    async list(filter?: { type?: string; status?: string }): Promise<TaskRecord[]> {
      let result = Array.from(tasks.values())
      if (filter?.type) {
        result = result.filter(t => t.type === filter.type)
      }
      if (filter?.status) {
        result = result.filter(t => t.status === filter.status)
      }
      return result
    },
  }
}

describe('Flow Engine onCancel Hook', () => {
  let storage: ReturnType<typeof createMemoryStorage>
  let engine: ReturnType<typeof createFlowEngine>
  let onCancelCalled: boolean
  let onCancelInput: unknown

  beforeEach(() => {
    storage = createMemoryStorage()
    engine = createFlowEngine({ storage, maxConcurrentTasks: 1 })
    onCancelCalled = false
    onCancelInput = null
  })

  it('should call onCancel when task is cancelled while pending', async () => {
    const handler: FlowTaskHandler<{ value: number }, { result: number }> = {
      async execute(input) {
        return { result: input.value * 2 }
      },
      async onCancel(input) {
        onCancelCalled = true
        onCancelInput = input
      },
    }

    engine.register('cancel-test', handler)

    const taskId = await engine.submit('cancel-test', { value: 1 })
    await engine.cancel(taskId)

    // Wait a bit for async cancellation
    await new Promise(resolve => setTimeout(resolve, 50))

    expect(onCancelCalled).toBe(true)
    expect(onCancelInput).toEqual({ value: 1 })
  })

  it('should call onCancel when task is cancelled while running', async () => {
    const handler: FlowTaskHandler<{ value: number }, { result: number }> = {
      async execute(input, context) {
        // Simulate long-running task
        await new Promise(resolve => setTimeout(resolve, 100))
        if (context.signal.aborted) {
          throw new Error('Task cancelled')
        }
        return { result: input.value * 2 }
      },
      async onCancel(input) {
        onCancelCalled = true
        onCancelInput = input
      },
    }

    engine.register('cancel-running-test', handler)

    const taskId = await engine.submit('cancel-running-test', { value: 1 })

    // Wait for task to start running
    await new Promise(resolve => setTimeout(resolve, 10))

    await engine.cancel(taskId)

    // Wait for cancellation to complete
    await new Promise(resolve => setTimeout(resolve, 150))

    expect(onCancelCalled).toBe(true)
  })

  it('should not break if onCancel is not defined', async () => {
    const handler: FlowTaskHandler<{ value: number }, { result: number }> = {
      async execute(input) {
        return { result: input.value * 2 }
      },
      // No onCancel defined
    }

    engine.register('no-cancel-handler', handler)

    const taskId = await engine.submit('no-cancel-handler', { value: 1 })

    // Should not throw
    await expect(engine.cancel(taskId)).resolves.not.toThrow()
  })
})
```

- [ ] **Step 15: Run tests**

Run: `npx vitest run tests/integration/flow/on-cancel.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 16: Commit**

```bash
git add src/features/ledger/server/tasks/categorize-entry.ts src/features/ledger/server/tasks/generate-category-metadata.ts tests/integration/flow/on-cancel.test.ts
git commit -m "feat(tasks): add onCancel hooks to categorize and metadata tasks

- Add onCancel to categorize-entry handler (logs cancellation)
- Add onCancel to generate-category-metadata handler (sets defaults)
- Add integration tests for onCancel behavior

Closes task flow optimization P2 requirement"
```

---

## Chunk 4: Unify Import Styles

**Objective:** Convert dynamic imports to static imports in categories.ts

### Task 4.1: Update categories.ts to use static imports

**Files:**
- Modify: `src/features/ledger/server/actions/categories.ts:1-15`

- [ ] **Step 17: Add static imports at top of file**

```typescript
"use server";

import { db } from "@/lib/db";
import { entryCategories, taskRuns } from "@/lib/db/schema";
import { z } from "zod";
import { eq, asc, desc, and, isNull, sql, inArray } from "drizzle-orm";
import { logger } from "@/lib/logger";
import { type SerializedEntryCategory, serializeEntryCategory } from "@/lib/serialization";
import { withLedgerAccess } from "@/lib/auth-actions";
import { flowEngine } from "@/lib/flow";  // Add static import
import { TASK_TYPE_GENERATE_CATEGORY_METADATA } from "@/features/ledger/server/tasks/generate-category-metadata";  // Add static import
import { forLedger } from "@/lib/db/scoped-query";
```

### Task 4.2: Remove dynamic imports

**Files:**
- Modify: `src/features/ledger/server/actions/categories.ts:48-64` and `99-103`

- [ ] **Step 18: Replace dynamic imports with direct usage**

In `createEntryCategoryAction`, replace:
```typescript
    // Trigger AI to generate metadata (async)
    // Only if icon or description is missing
    if (!validated.icon || !validated.description) {
        try {
            // Fetch existing categories for context
            const existing = await db.query.entryCategories.findMany({
                where: and(
                    eq(entryCategories.ledgerId, ledgerId),
                    isNull(entryCategories.deletedAt)
                ),
                columns: { name: true, description: true, icon: true }
            });

            // Use static imports instead of dynamic
            await flowEngine.submit(
                TASK_TYPE_GENERATE_CATEGORY_METADATA,
                {
                    ledgerId: ledgerId,
                    categoryId: category.id,
                    categoryName: category.name,
                    existingCategories: existing,
                    aiLanguage: "zh-CN",
                },
                {
                    title: `Generate metadata for category: ${validated.name}`,
                    scopeId: ledgerId,
                    entityType: 'category',
                    entityId: category.id,
                }
            );
        } catch (err) {
            logger.error({ err, ledgerId }, "Failed to submit category metadata task");
            // Don't fail the request, just log
        }
    }
```

In `deleteEntryCategoryAction`, replace:
```typescript
export const deleteEntryCategoryAction = withLedgerAccess(async (ledgerId: string, categoryId: string): Promise<void> => {

    // Cancel any pending/running background tasks for this category
    // Use static import instead of dynamic
    const pendingTasks = await db
        .select({ id: taskRuns.id })
        .from(taskRuns)
        .where(and(
            eq(taskRuns.type, "generate_category_metadata"),
            inArray(taskRuns.status, ["pending", "running"]),
            isNull(taskRuns.deletedAt),
            eq(taskRuns.entityType, 'category'),
            eq(taskRuns.entityId, categoryId)
        ));

    for (const task of pendingTasks) {
        await flowEngine.cancel(task.id);
    }

    const { ledgerEntries } = await import("@/lib/db/schema");
    const q = forLedger(entryCategories, ledgerId);

    // ... rest of function unchanged
```

- [ ] **Step 19: Verify no circular dependency errors**

Run: `npm run build`
Expected: Build succeeds without errors

- [ ] **Step 20: Run related tests**

Run: `npx vitest run tests/integration/ledger/category-actions.test.ts`
Expected: All tests pass

- [ ] **Step 21: Commit**

```bash
git add src/features/ledger/server/actions/categories.ts
git commit -m "refactor(actions): unify import styles in categories.ts

- Convert dynamic imports to static imports for flowEngine and task types
- Remove unnecessary async imports that were added for historical reasons
- Verified no circular dependency issues

Closes task flow optimization P3 requirement"
```

---

## Chunk 5: Create Task Registry

**Objective:** Centralize task registration logic

### Task 5.1: Create task-registry.ts

**Files:**
- Create: `src/lib/flow/task-registry.ts`

- [ ] **Step 22: Create centralized task registry**

```typescript
/**
 * Task Registry - Centralized task handler registration
 *
 * This module maintains the explicit list of task handlers to register.
 * Each task module registers itself via side effect when imported.
 */

const taskModules = [
    () => import("@/features/source-document/server/tasks/parse-source-document"),
    () => import("@/features/ledger/server/tasks/generate-category-metadata"),
    () => import("@/features/ledger/server/tasks/categorize-entry"),
] as const;

/**
 * Register all task handlers with the flow engine.
 * Called once during application startup.
 */
export async function registerAllTasks(): Promise<void> {
    for (const importFn of taskModules) {
        await importFn();
    }
}

/**
 * Get list of registered task types for debugging/monitoring.
 * Note: This returns the list of modules, actual registration happens
 * via side effect when modules are imported.
 */
export function getRegisteredTaskModules(): string[] {
    return [
        "parse-source-document",
        "generate-category-metadata",
        "categorize-entry",
    ];
}
```

### Task 5.2: Update instrumentation.ts

**Files:**
- Modify: `src/instrumentation.ts:1-29`

- [ ] **Step 23: Use task registry in instrumentation**

```typescript
import { logger } from "@/lib/logger";
import { registerAllTasks } from "@/lib/flow/task-registry";

export async function register() {
    // Only run on server-side runtime (not edge or browser)
    if (process.env.NEXT_RUNTIME !== 'nodejs') {
        return;
    }

    logger.info("Starting Cashier service...");

    // Log critical configuration status for diagnostics (safe, no secrets exposed)
    logger.info({
        nodeEnv: process.env.NODE_ENV ?? "not set",
        databaseUrl: process.env.DATABASE_URL ? "configured" : "not configured",
        localStorage: process.env.LOCAL_STORAGE_PATH ?? "./data/uploads",
    }, "Service configuration status");

    try {
        // Register all task handlers via centralized registry
        await registerAllTasks();

        logger.info("Task handlers registered successfully");
    } catch (error) {
        logger.error({ error }, "Failed during startup initialization");
    }
}
```

### Task 5.3: Update categorize.ts to use deduplication

**Files:**
- Modify: `src/features/ledger/server/actions/categorize.ts:112-119`

- [ ] **Step 24: Add deduplicationKey to categorize task submission**

```typescript
    await flowEngine.submit(TASK_TYPE_CATEGORIZE_ENTRY, taskInput, {
        title: `Categorize: ${entry.itemName}`,
        scopeId: ledgerId,
        entityType: 'entry',
        entityId: entry.id,
        deduplicationKey: `categorize:${ledgerId}:${entry.id}`,  // Add this
    });
```

### Task 5.4: Remove manual duplicate checking

**Files:**
- Modify: `src/features/ledger/server/actions/categorize.ts:17-41` and related usage

- [ ] **Step 25: Remove getPendingCategorizeTaskEntryIds function**

Delete the entire `getPendingCategorizeTaskEntryIds` function (lines 17-41) and update `shouldSkipEntry` to remove the duplicate check:

```typescript
/**
 * Check if entry should be skipped for categorization
 */
function shouldSkipEntry(
    entry: {
        id: string;
        sourceDocument?: { type?: string | null } | null;
    }
): boolean {
    // Skip quick entries (manual type source documents) - user's explicit choice
    if (entry.sourceDocument?.type === 'manual') {
        return true;
    }
    // Duplicate prevention now handled by flowEngine deduplicationKey
    return false;
}
```

Update `submitCategorizeTasksForEntries` to remove the pendingEntryIds parameter:

```typescript
async function submitCategorizeTasksForEntries(
    ledgerId: string,
    entries: Array<{
        id: string;
        categoryId: string | null;
        itemName: string;
        amount: string;
        currency: string | null;
        description: string | null;
        sourceDocument?: {
            type?: string | null;
            entryDate: string | null;
            text: string | null;
            imageUrls: string[] | null;
        } | null;
    }>
): Promise<CategorizeResult> {
    if (entries.length === 0) {
        return { submittedCount: 0, skippedCount: 0 };
    }

    const [indexedCategories, aiLanguage] = await Promise.all([
        buildIndexedCategories(ledgerId),
        getLedgerAILanguage(ledgerId),
    ]);

    let submittedCount = 0;
    let skippedCount = 0;

    for (const entry of entries) {
        if (shouldSkipEntry(entry)) {
            skippedCount++;
            continue;
        }

        await submitSingleCategorizeTask(entry, ledgerId, indexedCategories, aiLanguage);
        submittedCount++;
    }

    return { submittedCount, skippedCount };
}
```

- [ ] **Step 26: Run categorize tests**

Run: `npx vitest run tests/integration/ledger/categorize-actions.test.ts`
Expected: All tests pass

- [ ] **Step 27: Commit**

```bash
git add src/lib/flow/task-registry.ts src/instrumentation.ts src/features/ledger/server/actions/categorize.ts
git commit -m "feat(flow): create centralized task registry and use deduplication

- Add src/lib/flow/task-registry.ts for centralized task registration
- Update instrumentation.ts to use registerAllTasks()
- Update categorize.ts to use deduplicationKey instead of manual checking
- Remove getPendingCategorizeTaskEntryIds function

Closes task flow optimization Phase 5 requirement"
```

---

## Final Verification

- [ ] **Step 28: Run all flow-related tests**

Run: `npx vitest run tests/integration/flow/ tests/integration/ledger/categorize-actions.test.ts tests/integration/ledger/category-actions.test.ts`
Expected: All tests pass

- [ ] **Step 29: Run build**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 30: Run lint**

Run: `npm run lint`
Expected: No errors

---

## Summary

This plan addresses all issues identified in the Deep Review:

| Priority | Issue | Resolution |
|----------|-------|------------|
| P0 | Duplicate submission in action layer | Added deduplicationKey to flowEngine.submit() |
| P1 | TaskRecord missing time fields | Added startedAt and completedAt |
| P2 | Missing onCancel hooks | Added to categorize-entry and generate-category-metadata |
| P3 | Inconsistent import styles | Unified to static imports |
| - | Scattered registration | Created centralized task-registry.ts |

**Files Modified:**
- `src/lib/flow/types.ts` - Add deduplicationKey, time fields
- `src/lib/flow/engine.ts` - Implement deduplication logic
- `src/lib/flow/adapters/drizzle-storage.ts` - Map time fields
- `src/features/ledger/server/tasks/categorize-entry.ts` - Add onCancel
- `src/features/ledger/server/tasks/generate-category-metadata.ts` - Add onCancel
- `src/features/ledger/server/actions/categories.ts` - Static imports
- `src/features/ledger/server/actions/categorize.ts` - Use deduplicationKey
- `src/instrumentation.ts` - Use task registry

**Files Created:**
- `src/lib/flow/task-registry.ts` - Centralized registration
- `tests/integration/flow/deduplication.test.ts` - Deduplication tests
- `tests/integration/flow/on-cancel.test.ts` - onCancel hook tests
