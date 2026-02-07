/**
 * Lightweight task version controller
 * Ensures that only the latest async task for a resource will complete execution.
 * Earlier tasks will detect they've been superseded and abort gracefully.
 */
class TaskVersionManager {
    private versions = new Map<string, number>();

    /**
     * Acquire a new version number, invalidating all previous tasks for this key.
     * @param key - Unique identifier for the task (e.g., "recalculate:ledger123")
     * @returns The new version number
     */
    acquire(key: string): number {
        const newVersion = (this.versions.get(key) || 0) + 1;
        this.versions.set(key, newVersion);
        return newVersion;
    }

    /**
     * Check if a version is still valid (i.e., no newer task has been started).
     * @param key - The task key
     * @param version - The version to check
     * @returns true if this is still the latest version
     */
    isValid(key: string, version: number): boolean {
        return this.versions.get(key) === version;
    }

    /**
     * Release the version after task completion (optional cleanup).
     * Only clears if the version is still valid.
     * @param key - The task key
     * @param version - The version to release
     */
    release(key: string, version: number): void {
        if (this.isValid(key, version)) {
            this.versions.delete(key);
        }
    }
}

export const taskVersionManager = new TaskVersionManager();
