// Processing Task Registry
// Registers task handlers by type

import { ProcessingTaskHandler } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const registry = new Map<string, ProcessingTaskHandler<any>>();

/**
 * Register a processing task handler for a specific task type.
 * Call this at module initialization time.
 */
export function registerProcessingTask<TOutput>(type: string, handler: ProcessingTaskHandler<TOutput>): void {
    if (registry.has(type)) {
        console.warn(`Processing task handler for type "${type}" is being overwritten.`);
    }
    registry.set(type, handler);
}

/**
 * Get the registered handler for a task type.
 * Returns ProcessingTaskHandler<unknown, unknown> - caller is responsible for type casting.
 */
export function getProcessingTaskHandler(type: string): ProcessingTaskHandler | undefined {
    return registry.get(type);
}

/**
 * Check if a task type is registered.
 */
export function isProcessingTaskTypeRegistered(type: string): boolean {
    return registry.has(type);
}

/**
 * Get all registered task types.
 */
export function getRegisteredProcessingTaskTypes(): string[] {
    return Array.from(registry.keys());
}
