export async function register() {
    console.log("Starting Cashier service...");

    // Only run on server-side runtime (not edge or browser)
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        try {
            const { recoverProcessingReceipts } = await import("@/lib/queue");
            await recoverProcessingReceipts();
        } catch (error) {
            console.error("Failed to recover processing receipts:", error);
        }
    }
}
