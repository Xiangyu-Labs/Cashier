import { db } from "@/lib/db";
import { inputMessages, ledgers, transactions } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import { getMessageProcessor } from "@/lib/message-processor/processor";
import { MessageInput } from "@/lib/message-processor/types";

let isProcessing = false;

export async function processMessageQueue() {
    if (isProcessing) return;
    isProcessing = true;

    try {
        await processNextMessage();
    } finally {
        isProcessing = false;
    }
}

// Process messages until queue is empty
async function processNextMessage() {
    let nextMessage = await db.query.inputMessages.findFirst({
        where: eq(inputMessages.status, "queued"),
        orderBy: [asc(inputMessages.createdAt)],
    });

    while (nextMessage) {
        await db
            .update(inputMessages)
            .set({ status: "processing" })
            .where(eq(inputMessages.id, nextMessage.id));

        try {
            await handleMessageProcessing(nextMessage);
        } catch (error) {
            console.error(`Failed to process message ${nextMessage.id}:`, error);
            await db
                .update(inputMessages)
                .set({
                    status: "failed",
                    error: error instanceof Error ? error.message : "Unknown error"
                })
                .where(eq(inputMessages.id, nextMessage.id));
        }

        // Fetch next
        nextMessage = await db.query.inputMessages.findFirst({
            where: eq(inputMessages.status, "queued"),
            orderBy: [asc(inputMessages.createdAt)],
        });
    }
}

async function handleMessageProcessing(message: typeof inputMessages.$inferSelect) {
    const allCategories = await db.query.categories.findMany({
        orderBy: (categories, { asc }) => [asc(categories.sortOrder)],
    });

    const messageInput: MessageInput = {
        text: message.text || undefined,
        images: message.imageUrls && message.imageUrls.length > 0
            ? message.imageUrls.map(url => ({ data: url, mimeType: "image/jpeg" })) // Assuming jpeg for simplicity, or we could store mimeType
            : undefined
    };

    const ledger = await db.query.ledgers.findFirst({
        where: eq(ledgers.id, message.ledgerId)
    });
    const autoConfirm = ledger?.autoConfirm || false;

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
        .update(inputMessages)
        .set({ aiResponse: result.rawResponse })
        .where(eq(inputMessages.id, message.id));

    const validTransactions = result.transactions.filter((tx) => tx.amount > 0);

    if (validTransactions.length === 0) {
        await db
            .update(inputMessages)
            .set({ status: "completed" }) // Nothing to add, just complete
            .where(eq(inputMessages.id, message.id));
        return;
    }

    // Always save proposed transactions first (or effectively prepare them)
    // We update the message to `to_confirm` state with the proposed transactions.
    // If auto-confirm is on, we'll immediately process them.
    await db
        .update(inputMessages)
        .set({
            status: "to_confirm",
            proposedTransactions: validTransactions
        })
        .where(eq(inputMessages.id, message.id));

    if (autoConfirm) {
        // Direct insertion
        for (const tx of validTransactions) {
            const categoryId = tx.category
                ? allCategories.find(c => c.name === tx.category)?.id ?? null
                : null;

            await db.insert(transactions).values({
                ledgerId: message.ledgerId,
                categoryId,
                inputMessageId: message.id,
                amount: tx.amount.toString(),
                currency: tx.currency,
                itemName: tx.itemName || "未分类",
                description: tx.notes || null,
                transactionDate: tx.transactionDate ? new Date(tx.transactionDate) : new Date(),
            });
        }

        // Mark as completed
        await db
            .update(inputMessages)
            .set({ status: "completed" })
            .where(eq(inputMessages.id, message.id));
    }
}
