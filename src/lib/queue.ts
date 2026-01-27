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

async function processNextMessage() {
    const nextMessage = await db.query.inputMessages.findFirst({
        where: eq(inputMessages.status, "queued"),
        orderBy: [asc(inputMessages.createdAt)],
    });

    if (!nextMessage) return;

    await db
        .update(inputMessages)
        .set({ status: "processing" })
        .where(eq(inputMessages.id, nextMessage.id));

    try {
        await handleMessageProcessing(nextMessage);

        // Status update is now handled inside handleMessageProcessing
        // because it could be 'completed' OR 'to_confirm'

    } catch (error) {
        console.error(`Failed to process message ${nextMessage.id}:`, error);
        await db
            .update(inputMessages)
            .set({
                status: "failed",
                error: error instanceof Error ? error.message : "Unknown error"
            })
            .where(eq(inputMessages.id, nextMessage.id));
    } finally {
        await processNextMessage();
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
    }, autoConfirm);

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

        await db
            .update(inputMessages)
            .set({ status: "completed" })
            .where(eq(inputMessages.id, message.id));

    } else {
        // Pending confirmation
        await db
            .update(inputMessages)
            .set({
                status: "to_confirm",
                proposedTransactions: validTransactions
            })
            .where(eq(inputMessages.id, message.id));
    }
}
