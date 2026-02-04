import { logger } from '@/lib/logger'
import type {
  FlowContext,
  FlowEngine,
  FlowEngineConfig,
  FlowTaskHandler,
  TaskFilter,
  TokenUsage,
  TokenUsageRecord,
} from './types'

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
  const handlers = new Map<string, FlowTaskHandler<unknown, unknown>>()
  const abortControllers = new Map<string, AbortController>()

  /**
   * Internal: Run a task to completion
   */
  async function runTask<TInput>(
    taskId: string,
    name: string,
    input: TInput,
    ledgerId: string | null,
    signal: AbortSignal
  ): Promise<void> {
    const handler = handlers.get(name)
    if (!handler) {
      logger.error({ taskName: name, taskId }, 'No handler registered for task')
      await config.storage.update(taskId, {
        status: 'failed',
        error: `No handler registered for task: ${name}`,
      })
      return
    }

    // Token usage accumulator (by model)
    const tokenUsage: Record<string, { input: number; output: number }> = {}

    // Update status to running
    await config.storage.update(taskId, { status: 'running' })

    // Build execution context
    const context: FlowContext = {
      taskId,
      ledgerId,
      signal,
      reportTokens: (usage: TokenUsage) => {
        if (!tokenUsage[usage.model]) {
          tokenUsage[usage.model] = { input: 0, output: 0 }
        }
        tokenUsage[usage.model].input += usage.input
        tokenUsage[usage.model].output += usage.output
      },
      updateProgress: async (message: string) => {
        await config.storage.update(taskId, { progress: message })
      },
    }

    try {
      // Execute the task
      const result = await handler.execute(input, context)

      // Call onComplete hook if defined
      if (handler.onComplete) {
        await handler.onComplete(result, input, context)
      }

      // Compute total token usage
      const total = Object.values(tokenUsage).reduce(
        (acc, t) => ({ input: acc.input + t.input, output: acc.output + t.output }),
        { input: 0, output: 0 }
      )

      const finalTokenUsage: TokenUsageRecord = {
        ...tokenUsage,
        total,
      }

      // Mark as completed
      await config.storage.update(taskId, {
        status: 'completed',
        result,
        tokenUsage: finalTokenUsage,
        progress: null,
      })

      logger.info({ taskName: name, taskId }, 'Task completed successfully')
    } catch (error) {
      const err = error as Error

      if (signal.aborted) {
        // Task was cancelled
        logger.info({ taskName: name, taskId }, 'Task cancelled')

        if (handler.onCancel) {
          try {
            await handler.onCancel(input, context)
          } catch (cancelError) {
            logger.error({ error: cancelError, taskId }, 'Error in task onCancel handler')
          }
        }

        await config.storage.update(taskId, {
          status: 'cancelled',
          progress: null,
        })
      } else {
        // Task failed
        logger.error({ taskName: name, taskId, error: err }, 'Task execution failed')

        if (handler.onError) {
          try {
            await handler.onError(err, input, context)
          } catch (errorHandlerError) {
            logger.error({ error: errorHandlerError, taskId }, 'Error in task onError handler')
          }
        }

        // Save accumulated token usage even on failure
        const total = Object.values(tokenUsage).reduce(
          (acc, t) => ({ input: acc.input + t.input, output: acc.output + t.output }),
          { input: 0, output: 0 }
        )

        const finalTokenUsage: TokenUsageRecord = Object.keys(tokenUsage).length > 0
          ? { ...tokenUsage, total }
          : { total: { input: 0, output: 0 } }

        await config.storage.update(taskId, {
          status: 'failed',
          error: err.message,
          tokenUsage: finalTokenUsage,
          progress: null,
        })
      }
    } finally {
      // Cleanup abort controller
      abortControllers.delete(taskId)
    }
  }

  return {
    register<TInput, TOutput>(name: string, handler: FlowTaskHandler<TInput, TOutput>): void {
      handlers.set(name, handler as FlowTaskHandler<unknown, unknown>)
      logger.debug({ taskName: name }, 'Task handler registered')
    },

    async submit<TInput>(
      name: string,
      input: TInput,
      meta?: { title?: string; ledgerId?: string }
    ): Promise<string> {
      // Validate handler exists
      if (!handlers.has(name)) {
        throw new Error(`No handler registered for task: ${name}`)
      }

      // Create task record
      const taskId = await config.storage.create({
        type: name,
        title: meta?.title,
        ledgerId: meta?.ledgerId,
        input,
      })

      // Create abort controller for cancellation
      const controller = new AbortController()
      abortControllers.set(taskId, controller)

      // Fire and forget - execute asynchronously
      // We intentionally don't await this
      runTask(taskId, name, input, meta?.ledgerId ?? null, controller.signal).catch((err) => {
        logger.error({ err, taskId }, 'Unhandled error in background task runner')
      })

      logger.info({ taskId, type: name, title: meta?.title }, 'Task submitted for background execution')

      return taskId
    },

    async cancel(taskId: string): Promise<void> {
      const controller = abortControllers.get(taskId)
      if (controller) {
        controller.abort()
        logger.info({ taskId }, 'Task cancellation requested')
      } else {
        // Task might already be completed or doesn't exist
        logger.warn({ taskId }, 'No active abort controller for task')
      }
    },

    async getStatus(taskId: string) {
      return config.storage.get(taskId)
    },

    async listTasks(filter?: TaskFilter) {
      return config.storage.list(filter)
    },

    async getRunningTasks() {
      return config.storage.list({ status: 'running' })
    },
  }
}
