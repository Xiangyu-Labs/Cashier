import { AsyncLocalStorage } from 'async_hooks';

/**
 * AI Context to track the current task run ID for automatic token usage recording.
 */
export interface AIContext {
    taskRunId: string;
}

const aiContextStorage = new AsyncLocalStorage<AIContext>();

/**
 * Run a function within an AI context.
 * Any AI calls made within this function (synchronously or asynchronously)
 * will have access to the provided taskRunId.
 */
export function withAIContext<T>(taskRunId: string, fn: () => T): T {
    return aiContextStorage.run({ taskRunId }, fn);
}

/**
 * Get the current task run ID from the context, if available.
 */
export function getCurrentTaskRunId(): string | undefined {
    const store = aiContextStorage.getStore();
    return store?.taskRunId;
}
