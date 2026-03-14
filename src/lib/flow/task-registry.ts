import { logger } from "@/lib/logger";
import type { FlowEngine } from "./types";

export interface TaskModule {
    default?: (engine: FlowEngine) => void;
    register?: (engine: FlowEngine) => void;
}

const TASK_FILE_PATTERN = /\.task\.ts$/;
const SERVER_TASKS_DIR = "server" + "/" + "tasks";

/**
 * Recursively find all task files matching server/tasks/*.task.ts pattern
 */
async function findTaskFiles(
    dir: string,
    readdir: (path: string, options: { withFileTypes: true }) => Promise<import("fs").Dirent[]>,
    join: (...paths: string[]) => string
): Promise<string[]> {
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
                results.push(...await findTaskFiles(fullPath, readdir, join));
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
        // Dynamic imports to avoid Edge Runtime issues
        // These are only executed in Node.js runtime (checked by caller)
        const [{ readdir }, { join }] = await Promise.all([
            import("fs/promises"),
            import("path"),
        ]);

        // Import flowEngine dynamically to avoid Edge Runtime issues
        const { flowEngine } = await import("@/lib/flow");

        // Search from src directory
        const srcDir = join(process.cwd(), "src");
        const taskFiles = await findTaskFiles(srcDir, readdir, join);

        logger.info({ count: taskFiles.length }, "Auto-discovering task handlers");

        for (const file of taskFiles) {
            try {
                const taskModule: TaskModule = await import(file);

                // Support both default export and named register export
                const registerFn = taskModule.default || taskModule.register;

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

