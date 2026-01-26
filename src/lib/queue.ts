import { db } from "@/lib/db";
import { inputMessages, ledgers, transactions } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import { getMessageProcessor } from "@/lib/message-processor/processor";
import { MessageInput } from "@/lib/message-processor/types";

let isProcessing = false;

export async function processMessageQueue() {
    if (isProcessing) return; // Prevent concurrent processing instances
    isProcessing = true;

    try {
        await processNextMessage();
    } finally {
        isProcessing = false;
    }
}

async function processNextMessage() {
    // 1. Fetch the oldest queued message
    // strictly order by createdAt asc to ensure FIFO
    const nextMessage = await db.query.inputMessages.findFirst({
        where: eq(inputMessages.status, "queued"),
        orderBy: [asc(inputMessages.createdAt)],
    });

    if (!nextMessage) {
        return; // Queue is empty
    }

    // 2. Mark as processing
    await db
        .update(inputMessages)
        .set({ status: "processing" })
        .where(eq(inputMessages.id, nextMessage.id));

    try {


        // Fetch global categories
        const allCategories = await db.query.categories.findMany({
            orderBy: (categories, { asc }) => [asc(categories.sortOrder)],
        });

        // Parse content back to MessageInput
        let messageInput: MessageInput;
        try {
            if (nextMessage.contentType === "text") {
                messageInput = { text: nextMessage.content };
            } else if (nextMessage.contentType === "image") {
                // Check if content is JSON array or single string
                if (nextMessage.content.startsWith("[")) {
                    const images = JSON.parse(nextMessage.content);
                    messageInput = {
                        images: images.map((data: string) => ({ data, mimeType: "image/jpeg" })), // Simplification, mimeType might be lost if not stored separately
                    };
                } else {
                    messageInput = {
                        images: [{ data: nextMessage.content, mimeType: "image/jpeg" }],
                    };
                }
            } else {
                // mixed or complex json
                messageInput = JSON.parse(nextMessage.content);
            }
        } catch {
            throw new Error("Failed to parse message content");
        }

        // Fetch ledger settings
        const ledger = await db.query.ledgers.findFirst({
            where: eq(ledgers.id, nextMessage.ledgerId)
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

        // 4. Update AI response
        await db
            .update(inputMessages)
            .set({ aiResponse: result.rawResponse })
            .where(eq(inputMessages.id, nextMessage.id));

        // 5. Create transactions
        const validTransactions = result.transactions.filter((tx) => tx.amount > 0);

        for (const tx of validTransactions) {
            let categoryId: string | null = null;
            const itemName = tx.itemName || "未分类";

            if (tx.category) {
                const matchedCategory = allCategories.find(
                    (c) => c.name === tx.category
                );
                if (matchedCategory) {
                    categoryId = matchedCategory.id;
                }
            }

            const metadata = tx.metadata || {};

            await db.insert(transactions).values({
                ledgerId: nextMessage.ledgerId,
                categoryId,
                inputMessageId: nextMessage.id,
                amount: tx.amount.toString(),
                currency: tx.currency,
                itemName,
                status: tx.status || "pending",
                sourceType: nextMessage.contentType as "text" | "image" | "mixed",
                transactionDate: tx.transactionDate ? new Date(tx.transactionDate) : null,
                description: metadata.notes || null,
                metadata,
            });
        }

        // 6. Mark as completed
        await db
            .update(inputMessages)
            .set({ status: "completed" })
            .where(eq(inputMessages.id, nextMessage.id));

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
        // 7. Process next message (Recursive-like but async safe)
        await processNextMessage();
    }
}
