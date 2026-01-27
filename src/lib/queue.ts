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
        await processNextMessage();
    }
}

async function handleMessageProcessing(message: typeof inputMessages.$inferSelect) {
    const allCategories = await db.query.categories.findMany({
        orderBy: (categories, { asc }) => [asc(categories.sortOrder)],
    });

    const messageInput = parseMessageContent(message);

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

    await db
        .update(inputMessages)
        .set({ aiResponse: result.rawResponse })
        .where(eq(inputMessages.id, message.id));

    const validTransactions = result.transactions.filter((tx) => tx.amount > 0);

    for (const tx of validTransactions) {
        const categoryId = tx.category
            ? allCategories.find(c => c.name === tx.category)?.id ?? null
            : null;

        const metadata = tx.metadata || {};

        await db.insert(transactions).values({
            ledgerId: message.ledgerId,
            categoryId,
            inputMessageId: message.id,
            amount: tx.amount.toString(),
            currency: tx.currency,
            itemName: tx.itemName || "未分类",
            status: tx.status || "pending",
            sourceType: message.contentType as "text" | "image" | "mixed",
            transactionDate: tx.transactionDate ? new Date(tx.transactionDate) : null,
            description: metadata.notes || null,
            metadata,
        });
    }
}

function parseMessageContent(message: typeof inputMessages.$inferSelect): MessageInput {
    if (message.contentType === "text") {
        // Try to parse as JSON first in case it's a mixed message stored as text
        try {
            const parsed = JSON.parse(message.content);
            if (typeof parsed === 'object' && parsed !== null && (parsed.text || parsed.images)) {
                return parsed;
            }
        } catch {
            // Not a JSON object or doesn't look like MessageInput, treat as raw text
            // console.warn("Failed to parse potential mixed content:", e);
        }
        return { text: message.content };
    }

    if (message.contentType === "image") {
        if (message.content.startsWith("[")) {
            const images = JSON.parse(message.content);
            return {
                images: images.map((data: string) => ({ data, mimeType: "image/jpeg" })),
            };
        }
        return {
            images: [{ data: message.content, mimeType: "image/jpeg" }],
        };
    }

    try {
        return JSON.parse(message.content);
    } catch {
        throw new Error("Failed to parse message content");
    }
}
