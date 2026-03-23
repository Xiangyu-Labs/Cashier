import { logger } from "@/lib/logger";
import { AppError } from "@/lib/errors";
import { recordTaskExecution, detectDeadTasks, calculateQueueDepth } from "./monitoring";
import type {
  AIContext,
  FlowContext,
  FlowEngine,
  FlowEngineConfig,
  FlowTaskHandler,
  TaskFilter,
  TokenUsage,
  TokenUsageRecord,
  TaskMetrics,
} from "./types";

function createUnconfiguredAIContext(): AIContext {
  return {
    async generate() {
      throw new AppError(
        "Flow engine AI context is not configured",
        "FLOW_AI_CONTEXT_NOT_CONFIGURED"
      );
    },
  };
}

/**
 * Create a Flow Engine instance
 *
 * The engine is a pure task manager - it only handles:
 * - Task submission/lifecycle
 * - State management (pending → running → completed/failed/cancelled)
 * - Cancellation signal propagation (AbortController)
 * - Token usage aggregation
 * - Error handling framework
 *
 * The engine does NOT care about:
 * - How many stages a task has
 * - Which models are used
 * - Arbitration logic
 * - Specific AI call implementations
 */
export function createFlowEngine(config: FlowEngineConfig): FlowEngine {
  const handlers = new Map<string, FlowTaskHandler<unknown, unknown>>();
  const abortControllers = new Map<string, AbortController>();
  const buildAIContext = config.aiContextFactory ?? (() => createUnconfiguredAIContext());

  // Concurrency control via semaphore pattern
  const maxConcurrent = config.maxConcurrentTasks ?? 10;
  let runningCount = 0;
  type PendingWaiter = {
    taskId: string;
    resolve: (granted: boolean) => void;
  };
  const pendingQueue: PendingWaiter[] = [];

  /**
   * Acquire a slot to run a task.
   * If all slots are occupied, the task will wait in queue.
   */
  async function acquireSlot(taskId: string): Promise<boolean> {
    if (maxConcurrent <= 0 || runningCount < maxConcurrent) {
      runningCount++;
      return true;
    }
    // Wait for a slot to become available
    return new Promise((resolve) => {
      pendingQueue.push({ taskId, resolve });
    });
  }

  /**
   * Release a slot after task completion.
   * If there are waiting tasks, give the slot to the next one.
   */
  function releaseSlot(): void {
    const next = pendingQueue.shift();
    if (next) {
      // Give slot directly to the next waiting task
      next.resolve(true);
    } else {
      // No waiting tasks, just decrement
      runningCount--;
    }
  }

  /**
   * Wake a cancelled waiter so its task can finalize its own cleanup.
   */
  function wakeCancelledWaiter(taskId: string): boolean {
    const index = pendingQueue.findIndex((item) => item.taskId === taskId);
    if (index !== -1) {
      const [waiter] = pendingQueue.splice(index, 1);
      waiter?.resolve(false);
      return true;
    }
    return false;
  }

  /**
   * Internal: Run a task to completion
   */
  async function runTask<TInput>(
    taskId: string,
    name: string,
    input: TInput,
    signal: AbortSignal
  ): Promise<void> {
    // Wait for an available slot (concurrency control)
    const slotGranted = await acquireSlot(taskId);

    // Get handler early so we can call onCancel if cancelled in queue
    const handler = handlers.get(name);
    if (!handler) {
      if (slotGranted) {
        releaseSlot();
      }
      logger.error({ taskName: name, taskId }, "No handler registered for task");
      await config.storage.update(taskId, {
        status: "failed",
        error: `No handler registered for task: ${name}`,
      });
      abortControllers.delete(taskId);
      return;
    }

    // Check if cancellation woke the waiter before it acquired a slot.
    if (!slotGranted) {
      if (handler.onCancel) {
        try {
          const context: FlowContext = {
            taskId,
            signal,
            reportTokens: () => {}, // No-op for cancellation
            updateProgress: async () => {},
            ai: buildAIContext(signal, () => {}),
          };
          await handler.onCancel(input, context);
        } catch (cancelError) {
          logger.error(
            { error: cancelError, taskId },
            "Error in task onCancel handler during queue cancellation"
          );
        }
      }

      await config.storage.update(taskId, { status: "cancelled", progress: null });
      logger.info({ taskId }, "Task cancelled while waiting in queue");
      abortControllers.delete(taskId);
      return;
    }

    // Check if cancelled while waiting in queue after a slot was handed off
    if (signal.aborted) {
      releaseSlot();

      // Call onCancel if handler exists, so domain cleanup happens
      if (handler.onCancel) {
        try {
          const context: FlowContext = {
            taskId,
            signal,
            reportTokens: () => {}, // No-op for cancellation
            updateProgress: async () => {},
            ai: buildAIContext(signal, () => {}),
          };
          await handler.onCancel(input, context);
        } catch (cancelError) {
          logger.error(
            { error: cancelError, taskId },
            "Error in task onCancel handler during queue cancellation"
          );
        }
      }

      await config.storage.update(taskId, { status: "cancelled", progress: null });
      logger.info({ taskId }, "Task cancelled while waiting in queue");
      abortControllers.delete(taskId);
      return;
    }

    // Token usage accumulator (by model)
    const tokenUsage: Record<string, { input: number; output: number }> = {};

    // Token reporter function (shared between context and AI context)
    const reportTokens = (usage: TokenUsage) => {
      const modelUsage = tokenUsage[usage.model] ?? { input: 0, output: 0 };
      modelUsage.input += usage.input;
      modelUsage.output += usage.output;
      tokenUsage[usage.model] = modelUsage;
    };

    // Update status to running
    await config.storage.update(taskId, { status: "running" });

    // Build execution context
    const context: FlowContext = {
      taskId,
      signal,
      reportTokens,
      updateProgress: async (message: string) => {
        await config.storage.update(taskId, { progress: message });
      },
      // AI capabilities with automatic token reporting
      ai: buildAIContext(signal, reportTokens),
    };

    const startTime = Date.now();

    try {
      // Execute the task
      const result = await handler.execute(input, context);

      // Call onComplete hook if defined
      if (handler.onComplete) {
        await handler.onComplete(result, input, context);
      }

      // Compute total token usage
      const total = Object.values(tokenUsage).reduce(
        (acc, t) => ({ input: acc.input + t.input, output: acc.output + t.output }),
        { input: 0, output: 0 }
      );

      const finalTokenUsage: TokenUsageRecord = {
        ...tokenUsage,
        total,
      };

      // Mark as completed
      await config.storage.update(taskId, {
        status: "completed",
        tokenUsage: finalTokenUsage,
        progress: null,
      });

      // Record task execution metrics
      recordTaskExecution(taskId, Date.now() - startTime);

      logger.info({ taskName: name, taskId }, "Task completed successfully");
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));

      if (signal.aborted) {
        // Task was cancelled
        logger.info({ taskName: name, taskId }, "Task cancelled");

        if (handler.onCancel) {
          try {
            await handler.onCancel(input, context);
          } catch (cancelError) {
            logger.error({ error: cancelError, taskId }, "Error in task onCancel handler");
          }
        }

        await config.storage.update(taskId, {
          status: "cancelled",
          progress: null,
        });
      } else {
        // Task failed
        logger.error({ taskName: name, taskId, error: err }, "Task execution failed");

        if (handler.onError) {
          try {
            await handler.onError(err, input, context);
          } catch (errorHandlerError) {
            logger.error({ error: errorHandlerError, taskId }, "Error in task onError handler");
          }
        }

        // Save accumulated token usage even on failure
        const total = Object.values(tokenUsage).reduce(
          (acc, t) => ({ input: acc.input + t.input, output: acc.output + t.output }),
          { input: 0, output: 0 }
        );

        const finalTokenUsage: TokenUsageRecord =
          Object.keys(tokenUsage).length > 0
            ? { ...tokenUsage, total }
            : { total: { input: 0, output: 0 } };

        await config.storage.update(taskId, {
          status: "failed",
          error: err.message,
          tokenUsage: finalTokenUsage,
          progress: null,
        });
      }
    } finally {
      // Release concurrency slot and cleanup abort controller
      releaseSlot();
      abortControllers.delete(taskId);
    }
  }

  return {
    register<TInput, TOutput>(name: string, handler: FlowTaskHandler<TInput, TOutput>): void {
      if (handlers.has(name)) {
        throw new AppError(
          `Task handler already registered: ${name}`,
          "TASK_HANDLER_ALREADY_REGISTERED"
        );
      }
      handlers.set(name, handler as FlowTaskHandler<unknown, unknown>);
      logger.debug({ taskName: name }, "Task handler registered");
    },

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
        throw new AppError(
          `No handler registered for task: ${name}`,
          "TASK_HANDLER_NOT_REGISTERED"
        );
      }

      // Check for duplicate tasks if deduplicationKey provided
      if (meta?.deduplicationKey != null && meta.deduplicationKey !== "") {
        // Check both pending and running tasks to prevent duplicates
        const [pendingTasks, runningTasks] = await Promise.all([
          config.storage.list({ type: name, status: "pending" }),
          config.storage.list({ type: name, status: "running" }),
        ]);
        const existingTasks = [...pendingTasks, ...runningTasks];

        for (const task of existingTasks) {
          if (
            task.deduplicationKey != null &&
            meta?.deduplicationKey != null &&
            task.deduplicationKey === meta.deduplicationKey
          ) {
            logger.info(
              {
                taskId: task.id,
                deduplicationKey: meta.deduplicationKey,
                taskName: name,
              },
              "Duplicate task detected, returning existing taskId"
            );
            return task.id;
          }
        }
      }

      // Create task record
      const taskId = await config.storage.create({
        type: name,
        ...(meta?.title !== undefined ? { title: meta.title } : {}),
        input,
        ...(meta?.deduplicationKey !== undefined
          ? { deduplicationKey: meta.deduplicationKey }
          : {}),
        ...(meta?.scopeId !== undefined ? { scopeId: meta.scopeId } : {}),
        ...(meta?.entityType !== undefined ? { entityType: meta.entityType } : {}),
        ...(meta?.entityId !== undefined ? { entityId: meta.entityId } : {}),
      });

      // Create abort controller for cancellation
      const controller = new AbortController();
      abortControllers.set(taskId, controller);

      // Fire and forget - execute asynchronously
      runTask(taskId, name, input, controller.signal).catch((err) => {
        logger.error({ err, taskId }, "Unhandled error in background task runner");
      });

      logger.info(
        { taskId, type: name, title: meta?.title },
        "Task submitted for background execution"
      );

      return taskId;
    },

    async cancel(taskId: string): Promise<void> {
      const controller = abortControllers.get(taskId);

      // First, check if task is waiting in the queue (hasn't started yet)
      if (wakeCancelledWaiter(taskId)) {
        controller?.abort();
        logger.info({ taskId }, "Task cancellation requested while pending");
        return;
      }

      // Task is running, send abort signal
      if (controller) {
        controller.abort();
        logger.info({ taskId }, "Task cancellation requested");
      } else {
        // No AbortController found - task is orphaned (e.g., server restarted)
        // Check if the task is still marked as running/pending in DB and force-cancel it
        const task = await config.storage.get(taskId);
        if (task && (task.status === "running" || task.status === "pending")) {
          await config.storage.update(taskId, { status: "cancelled", progress: null });
          logger.info({ taskId }, "Orphaned task force-cancelled in DB");
        } else {
          logger.warn(
            { taskId, status: task?.status },
            "No active abort controller for task, task not in cancellable state"
          );
        }
      }
    },

    async getStatus(taskId: string) {
      return config.storage.get(taskId);
    },

    async listTasks(filter?: TaskFilter) {
      return config.storage.list(filter);
    },

    async getRunningTasks() {
      return config.storage.list({ status: "running" });
    },

    async getMetrics(): Promise<TaskMetrics> {
      const tasks = await config.storage.list();
      return {
        executionTime: 0, // aggregated separately
        queueDepth: calculateQueueDepth(tasks),
        deadTasks: detectDeadTasks(tasks),
      };
    },
  };
}
