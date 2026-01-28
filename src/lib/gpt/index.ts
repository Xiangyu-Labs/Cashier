// GPT Task Infrastructure
// Public exports

// Types
export type {
    TaskStatus,
    TaskProgress,
    TaskHandler,
    TaskExecutionContext,
    GptTask,
    CreateTaskParams,
    TaskHandlerFactory,
} from "./types";

// Registry
export { registerTask, getTaskHandler, isTaskTypeRegistered, getRegisteredTaskTypes } from "./task-registry";

// Service
export {
    createTask,
    getTask,
    getRecentTasks,
    getTasksByStatus,
    getActiveTasks,
    markTaskRunning,
    markTaskCompleted,
    markTaskFailed,
    updateTaskProgress,
    getNextQueuedTask,
    getRunningTasks,
} from "./task-service";

// Worker
export { processTaskQueue, isWorkerProcessing } from "./task-worker";

// Recovery
export { handleTasksOnStartup } from "./recovery";
