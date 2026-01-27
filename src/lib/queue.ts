import { db } from "@/lib/db";
import { receipts, ledgers, transactions } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import { getMessageProcessor } from "@/lib/message-processor/processor";
import { MessageInput } from "@/lib/message-processor/types";

let isProcessing = false;

export async function processReceiptQueue() {
    if (isProcessing) return;
    isProcessing = true;

    try {
        await processNextMessage();
    } finally {
        isProcessing = false;
    }
}

// Process messages until queue is empty
export async function recoverProcessingReceipts() {
    try {
        const result = await db
            .update(receipts)
            .set({ status: "queued" })
            .where(eq(receipts.status, "processing"))
            .returning({ id: receipts.id });

        if (result.length > 0) {
            console.log(`Recovered ${result.length} processing receipts to queued state.`);
            // Restart processing
            processReceiptQueue().catch(err => {
                console.error("Failed to restart queue processing after recovery:", err);
            });
        }
    } catch (error) {
        console.error("Failed to recover processing receipts:", error);
    }
}

// Process messages until queue is empty
async function processNextMessage() {
    let nextReceipt = await db.query.receipts.findFirst({
        where: eq(receipts.status, "queued"),
        orderBy: [asc(receipts.createdAt)],
    });

    while (nextReceipt) {
        await db
            .update(receipts)
            .set({ status: "processing" })
            .where(eq(receipts.id, nextReceipt.id));

        try {
            await handleReceiptProcessing(nextReceipt);
        } catch (error) {
            console.error(`Failed to process receipt ${nextReceipt.id}:`, error);
            await db
                .update(receipts)
                .set({
                    status: "failed",
                    error: error instanceof Error ? error.message : "Unknown error"
                })
                .where(eq(receipts.id, nextReceipt.id));
        }

        // Fetch next
        nextReceipt = await db.query.receipts.findFirst({
            where: eq(receipts.status, "queued"),
            orderBy: [asc(receipts.createdAt)],
        });
    }
}

async function handleReceiptProcessing(receipt: typeof receipts.$inferSelect) {
    const allCategories = await db.query.categories.findMany({
        orderBy: (categories, { asc }) => [asc(categories.sortOrder)],
    });

    const messageInput: MessageInput = {
        text: receipt.text || undefined,
        images: receipt.imageUrls && receipt.imageUrls.length > 0
            ? receipt.imageUrls.map(url => ({ data: url, mimeType: "image/jpeg" })) // Assuming jpeg for simplicity, or we could store mimeType
            : undefined
    };

    const ledger = await db.query.ledgers.findFirst({
        where: eq(ledgers.id, receipt.ledgerId)
    });
    const autoConfirm = ledger?.autoConfirm || false;
    const autoRecognizeDate = ledger?.autoRecognizeDate || false;

    const processor = getMessageProcessor();
    const result = await processor.process(messageInput, {
        categories: allCategories.map((c) => ({
            id: c.id,
            name: c.name,
            description: c.description,
        })),
    });

    // Save AI response for debugging
    await db
        .update(receipts)
        .set({ aiResponse: result.rawResponse })

        .where(eq(receipts.id, receipt.id));

    if (result.isValid === false) {
        await db
            .update(receipts)
            .set({ status: "invalid" })
            .where(eq(receipts.id, receipt.id));
        return;
    }

    const validTransactions = result.transactions
        .filter((tx) => tx.amount > 0)
        .map((tx) => {
            // If autoRecognizeDate is false, we ignore AI's date and use current date
            // However, we want to persist "Today" effectively. 
            // If we set null, the DB default might be used? No, existing code used new Date().
            // Let's explicitly set it if we want to override.

            // Actually, existing code: transactionDate: tx.transactionDate ? new Date(tx.transactionDate) : new Date(),

            if (!autoRecognizeDate) {
                return { ...tx, transactionDate: new Date().toISOString() };
            }
            return tx;
        });

    if (validTransactions.length === 0) {
        await db
            .update(receipts)
            .set({ status: "completed" }) // Nothing to add, just complete
            .where(eq(receipts.id, receipt.id));
        return;
    }

    // Always save proposed transactions first (or effectively prepare them)
    // We update the receipt to `to_confirm` state with the proposed transactions.
    // If auto-confirm is on, we'll immediately process them.
    await db
        .update(receipts)
        .set({
            status: "to_confirm",
            proposedTransactions: validTransactions
        })
        .where(eq(receipts.id, receipt.id));

    if (autoConfirm) {
        // Direct insertion
        for (const tx of validTransactions) {
            const categoryId = tx.category
                ? allCategories.find(c => c.name === tx.category)?.id ?? null
                : null;

            await db.insert(transactions).values({
                ledgerId: receipt.ledgerId,
                categoryId,
                receiptId: receipt.id,
                amount: tx.amount.toString(),
                currency: tx.currency,
                itemName: tx.itemName || "未分类",
                description: tx.notes || null,
                transactionDate: tx.transactionDate ? new Date(tx.transactionDate) : new Date(),
            });
        }

        // Mark as completed
        await db
            .update(receipts)
            .set({ status: "completed" })
            .where(eq(receipts.id, receipt.id));
    }
}
