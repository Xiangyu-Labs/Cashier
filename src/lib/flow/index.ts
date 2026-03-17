// Flow Engine - A lightweight async task manager for AI workloads
//
// Usage:
//   import { flowEngine } from '@/lib/flow'
//
//   // Register a task handler
//   flowEngine.register('my-task', {
//     async execute(input, context) {
//       await context.updateProgress('Processing...')
//       const result = await doAICall({ signal: context.signal })
//       context.reportTokens({ model: 'gpt-4o', input: 100, output: 50 })
//       return result
//     }
//   })
//
//   // Submit a task
//   const taskId = await flowEngine.submit('my-task', { data: 'input' }, { title: 'My Task' })
//
//   // Check status
//   const status = await flowEngine.getStatus(taskId)

export * from "./types";
export { createFlowEngine } from "./engine";
export { createAIContext } from "./ai-context";
export { createDrizzleStorage } from "./adapters/drizzle-storage";

// ===== Default Cashier Instance =====

import { createFlowEngine } from "./engine";
import { createDrizzleStorage } from "./adapters/drizzle-storage";

/**
 * Default Flow Engine instance for Cashier
 *
 * Pre-configured with Drizzle storage adapter.
 * Import and use directly in your task handlers.
 *
 * Concurrency is controlled by MAX_TASK_WORKER env variable (default: 10).
 * Set to 0 for unlimited concurrent tasks.
 */
const maxConcurrentTasks = parseInt(process.env.MAX_TASK_WORKER || "10", 10);

export const flowEngine = createFlowEngine({
  storage: createDrizzleStorage(),
  maxConcurrentTasks,
});
