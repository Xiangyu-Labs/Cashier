export async function register() {
    console.log("Starting Cashier service...");

    // Only run on server-side runtime (not edge or browser)
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        try {
            // Register task handlers (side-effect imports)
            await import("@/lib/tasks");

            // Handle legacy receipt queue recovery
            const { recoverProcessingReceipts } = await import("@/lib/queue");
            await recoverProcessingReceipts();

            // Handle GPT task recovery (mark running as failed)
            const { handleTasksOnStartup } = await import("@/lib/gpt/recovery");
            await handleTasksOnStartup();
        } catch (error) {
            console.error("Failed during startup recovery:", error);
        }
    }
}
