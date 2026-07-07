import { validateStartupEnv } from "@/lib/env/startup";
import { logger } from "@/lib/logger";

export async function register() {
  // Only run on server-side runtime (not edge or browser)
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  logger.info("Starting Cashier service...");

  // Log critical configuration status for diagnostics (safe, no secrets exposed)
  try {
    const startupEnv = validateStartupEnv();

    logger.info(
      {
        nodeEnv: process.env.NODE_ENV ?? "not set",
        databaseUrl: startupEnv.DATABASE_URL !== "" ? "configured" : "not configured",
        localStorage: startupEnv.LOCAL_STORAGE_PATH,
      },
      "Service configuration status"
    );

    const { initializeDefaultFlowRuntime } = await import("@/lib/flow/runtime");
    await initializeDefaultFlowRuntime();

    const { initializeExchangeRateLedgerRecalculationOrchestration } = await import(
      "@/lib/orchestration/exchange-rate-ledger-recalculation"
    );
    initializeExchangeRateLedgerRecalculationOrchestration();

    logger.info("Flow runtime initialized successfully");
  } catch (error) {
    logger.error({ error }, "Failed during startup initialization");
    throw error;
  }
}
