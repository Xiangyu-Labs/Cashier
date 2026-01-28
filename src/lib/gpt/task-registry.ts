// GPT Task Registry
// Registers task handlers by type

import { TaskHandler } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const registry = new Map<string, TaskHandler<any, any>>();

/**
 * Register a task handler for a specific task type.
 * Call this at module initialization time.
 */
export function registerTask<TInput, TOutput>(type: string, handler: TaskHandler<TInput, TOutput>): void {
    if (registry.has(type)) {
        console.warn(`Task handler for type "${type}" is being overwritten.`);
    }
    registry.set(type, handler);
}

/**
 * Get the registered handler for a task type.
 * Returns TaskHandler<unknown, unknown> - caller is responsible for type casting.
 */
export function getTaskHandler(type: string): TaskHandler | undefined {
    return registry.get(type);
}

/**
 * Check if a task type is registered.
 */
export function isTaskTypeRegistered(type: string): boolean {
    return registry.has(type);
}

/**
 * Get all registered task types.
 */
export function getRegisteredTaskTypes(): string[] {
    return Array.from(registry.keys());
}
