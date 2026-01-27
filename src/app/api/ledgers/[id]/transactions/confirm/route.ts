import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { transactions, inputMessages, categories } from "@/lib/db/schema";
import { eq, inArray, and } from "drizzle-orm";
import { z } from "zod";

const confirmSchema = z.object({
    transactionIds: z.array(z.string()).optional(),
    confirmAll: z.boolean().optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

interface ProposedTransaction {
    category?: string;
    amount?: number | string;
    currency?: string;
    itemName?: string;
    notes?: string;
    transactionDate?: string;
}

// POST /api/ledgers/[id]/transactions/confirm - 确认交易
export async function POST(
    request: NextRequest,
    { params }: RouteParams
) {
    try {
        const { id: ledgerId } = await params;
        const body = await request.json();
        const { transactionIds, confirmAll } = confirmSchema.parse(body);

        if (confirmAll) {
            // Logic for confirming ALL pending messages
            // 1. Fetch all to_confirm messages
            const messages = await db.query.inputMessages.findMany({
                where: and(
                    eq(inputMessages.ledgerId, ledgerId),
                    eq(inputMessages.status, "to_confirm")
                ),
            });

            if (messages.length === 0) {
                return NextResponse.json({ success: true, updatedCount: 0 });
            }

            const allCategories = await db.query.categories.findMany({
                where: eq(categories.ledgerId, ledgerId),
            });

            let count = 0;

            for (const msg of messages) {
                if (!msg.proposedTransactions || !Array.isArray(msg.proposedTransactions)) {
                    // Provide a fallback to complete empty messages or skip?
                    // Mark as completed anyway to clear queue if it's stuck
                    await db.update(inputMessages).set({ status: 'completed' }).where(eq(inputMessages.id, msg.id));
                    continue;
                }

                const proposedTxs = msg.proposedTransactions as unknown as ProposedTransaction[];

                for (const tx of proposedTxs) {
                    const categoryName = tx.category;
                    const category = allCategories.find(c => c.name === categoryName);

                    await db.insert(transactions).values({
                        ledgerId: msg.ledgerId,
                        categoryId: category?.id || null,
                        inputMessageId: msg.id,
                        amount: tx.amount?.toString() || "0",
                        currency: tx.currency || "CNY",
                        itemName: tx.itemName || "未分类",
                        description: tx.notes || null,
                        transactionDate: tx.transactionDate ? new Date(tx.transactionDate) : new Date(msg.createdAt),
                    });
                    count++;
                }

                await db
                    .update(inputMessages)
                    .set({ status: "completed" })
                    .where(eq(inputMessages.id, msg.id));
            }

            return NextResponse.json({ success: true, updatedCount: count });
        }

        if (!transactionIds || transactionIds.length === 0) {
            return NextResponse.json({ success: true, updatedCount: 0 });
        }

        // Logic for confirming specific transactions (by ID list)
        // IDs are in format: "pending:messageId:index"
        // We need to group them by messageId

        const messageGroups: Record<string, number[]> = {};

        for (const id of transactionIds) {
            if (!id.startsWith("pending:")) continue;
            const parts = id.split(":");
            if (parts.length !== 3) continue;
            const msgId = parts[1];
            const idx = parseInt(parts[2], 10);

            if (!messageGroups[msgId]) {
                messageGroups[msgId] = [];
            }
            messageGroups[msgId].push(idx);
        }

        const messageIds = Object.keys(messageGroups);
        if (messageIds.length === 0) {
            return NextResponse.json({ success: true, updatedCount: 0 });
        }

        const messages = await db.query.inputMessages.findMany({
            where: and(
                eq(inputMessages.ledgerId, ledgerId),
                inArray(inputMessages.id, messageIds),
                eq(inputMessages.status, "to_confirm")
            )
        });

        const allCategories = await db.query.categories.findMany({
            where: eq(categories.ledgerId, ledgerId),
        });

        let updatedCount = 0;

        for (const msg of messages) {
            const indices = messageGroups[msg.id];
            if (!msg.proposedTransactions || !Array.isArray(msg.proposedTransactions)) continue;

            const proposedTxs = msg.proposedTransactions as unknown as ProposedTransaction[];

            for (const idx of indices) {
                const tx = proposedTxs[idx];
                if (!tx) continue;

                const categoryName = tx.category;
                const category = allCategories.find(c => c.name === categoryName);

                await db.insert(transactions).values({
                    ledgerId: msg.ledgerId,
                    categoryId: category?.id || null,
                    inputMessageId: msg.id,
                    amount: tx.amount?.toString() || "0",
                    currency: tx.currency || "CNY",
                    itemName: tx.itemName || "未分类",
                    description: tx.notes || null,
                    transactionDate: tx.transactionDate ? new Date(tx.transactionDate) : new Date(msg.createdAt),
                });
                updatedCount++;
            }

            // Check if we processed all? 
            // For simplicity in this MVP, if we process ANY transaction from a message, 
            // we consider the message "completed" in terms of queue status.
            // Or we should check if all indices were covered?
            // The UI sends all indices for a batch. So safe to assume completion.

            await db.update(inputMessages)
                .set({ status: 'completed' })
                .where(eq(inputMessages.id, msg.id));
        }

        return NextResponse.json({ success: true, updatedCount });

    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: "Validation failed", details: error.issues },
                { status: 400 }
            );
        }
        console.error("Failed to confirm transactions:", error);
        return NextResponse.json(
            { error: "Failed to confirm transactions" },
            { status: 500 }
        );
    }
}
