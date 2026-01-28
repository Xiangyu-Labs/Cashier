// Processing Task Infrastructure
// Public exports

// Types
export type {
    ProcessingTaskStatus,
    ProcessingTaskProgress,
    ProcessingTaskHandler,
    ProcessingTaskExecutionContext,
    ProcessingTask,
    CreateProcessingTaskParams,
    ProcessingTaskHandlerFactory,
} from "./types";

// Registry
export { registerProcessingTask, getProcessingTaskHandler, isProcessingTaskTypeRegistered, getRegisteredProcessingTaskTypes } from "./task-registry";

// Service
export {
    createProcessingTask,
    getProcessingTask,
    getRecentProcessingTasks,
    getProcessingTasksByStatus,
    getActiveProcessingTasks,
    markProcessingTaskRunning,
    markProcessingTaskCompleted,
    markProcessingTaskFailed,
    updateProcessingTaskProgress,
    claimNextProcessingTask,
    getNextQueuedProcessingTask,
    getRunningProcessingTasks,
} from "./task-service";

// Worker
export { processTaskQueue, isWorkerProcessing } from "./task-worker";

// Recovery
export { handleTasksOnStartup } from "./recovery";
