import { logger } from "@/lib/logger";

export async function register() {
  // Only run on server-side runtime (not edge or browser)
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  logger.info("Starting Cashier service...");

  // Log critical configuration status for diagnostics (safe, no secrets exposed)
  logger.info(
    {
      nodeEnv: process.env.NODE_ENV ?? "not set",
      databaseUrl: process.env.DATABASE_URL != null ? "configured" : "not configured",
      localStorage: process.env.LOCAL_STORAGE_PATH ?? "./data/uploads",
    },
    "Service configuration status"
  );

  try {
    // Dynamically import task registry to avoid loading Node.js modules in Edge Runtime
    const { registerAllTasks } = await import("@/lib/flow/task-registry");

    // Register all task handlers via centralized registry
    await registerAllTasks();

    logger.info("Task handlers registered successfully");
  } catch (error) {
    logger.error({ error }, "Failed during startup initialization");
    throw error;
  }
}
