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
