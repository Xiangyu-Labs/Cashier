import { logger } from "@/lib/logger";
import { flowEngine } from "./engine";
import { readdir, stat } from "fs/promises";
import { join, dirname } from "path";

export interface TaskModule {
    default?: (engine: typeof flowEngine) => void;
    register?: (engine: typeof flowEngine) => void;
}

const TASK_FILE_PATTERN = /\.task\.ts$/;
const SERVER_TASKS_DIR = "server" + "/" + "tasks";

/**
 * Recursively find all task files matching server/tasks/*.task.ts pattern
 */
async function findTaskFiles(dir: string): Promise<string[]> {
    const results: string[] = [];

    try {
        const entries = await readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = join(dir, entry.name);

            if (entry.isDirectory()) {
                // Skip node_modules and .next
                if (entry.name === "node_modules" || entry.name === ".next") {
                    continue;
                }
                results.push(...await findTaskFiles(fullPath));
            } else if (entry.isFile() && TASK_FILE_PATTERN.test(entry.name)) {
                // Check if file is in a server/tasks directory
                if (fullPath.includes(SERVER_TASKS_DIR)) {
                    results.push(fullPath);
                }
            }
        }
    } catch {
        // Directory doesn't exist or can't be read, skip
    }

    return results;
}

/**
 * Auto-discover and register all task handlers from server/tasks/*.task.ts files
 */
export async function autoRegisterTasks(): Promise<void> {
    try {
        // Search from src directory
        const srcDir = join(process.cwd(), "src");
        const taskFiles = await findTaskFiles(srcDir);

        logger.info({ count: taskFiles.length }, "Auto-discovering task handlers");

        for (const file of taskFiles) {
            try {
                const module: TaskModule = await import(file);

                // Support both default export and named register export
                const registerFn = module.default || module.register;

                if (typeof registerFn === "function") {
                    registerFn(flowEngine);
                    logger.debug({ file }, "Registered task handler");
                } else {
                    logger.warn({ file }, "Task file has no register function");
                }
            } catch (error) {
                logger.error({ error, file }, "Failed to register task handler");
            }
        }

        logger.info("Task handler auto-registration complete");
    } catch (error) {
        logger.error({ error }, "Failed during task auto-discovery");
        throw error;
    }
}

/**
 * Manual registration for testing or special cases
 */
export function registerTask(
    name: string,
    handler: Parameters<typeof flowEngine.register>[1]
): void {
    flowEngine.register(name, handler);
    logger.info({ name }, "Manually registered task handler");
}
