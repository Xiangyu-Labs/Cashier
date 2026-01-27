import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { transactions, receipts, categories } from "@/lib/db/schema";
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
            // Logic for confirming ALL pending receipts
            // 1. Fetch all to_confirm receipts
            const pendingReceipts = await db.query.receipts.findMany({
                where: and(
                    eq(receipts.ledgerId, ledgerId),
                    eq(receipts.status, "to_confirm")
                ),
            });

            if (pendingReceipts.length === 0) {
                return NextResponse.json({ success: true, updatedCount: 0 });
            }

            const allCategories = await db.query.categories.findMany({
                where: eq(categories.ledgerId, ledgerId),
            });

            let count = 0;

            for (const receipt of pendingReceipts) {
                if (!receipt.proposedTransactions || !Array.isArray(receipt.proposedTransactions)) {
                    // Provide a fallback to complete empty receipts or skip?
                    // Mark as completed anyway to clear queue if it's stuck
                    await db.update(receipts).set({ status: 'completed' }).where(eq(receipts.id, receipt.id));
                    continue;
                }

                const proposedTxs = receipt.proposedTransactions as unknown as ProposedTransaction[];

                for (const tx of proposedTxs) {
                    const categoryName = tx.category;
                    const category = allCategories.find(c => c.name === categoryName);

                    await db.insert(transactions).values({
                        ledgerId: receipt.ledgerId,
                        categoryId: category?.id || null,
                        receiptId: receipt.id,
                        amount: tx.amount?.toString() || "0",
                        currency: tx.currency || "CNY",
                        itemName: tx.itemName || "未分类",
                        description: tx.notes || null,
                        transactionDate: tx.transactionDate ? new Date(tx.transactionDate) : new Date(receipt.createdAt),
                    });
                    count++;
                }

                await db
                    .update(receipts)
                    .set({ status: "completed" })
                    .where(eq(receipts.id, receipt.id));
            }

            return NextResponse.json({ success: true, updatedCount: count });
        }

        if (!transactionIds || transactionIds.length === 0) {
            return NextResponse.json({ success: true, updatedCount: 0 });
        }

        // Logic for confirming specific transactions (by ID list)
        // IDs are in format: "pending:receiptId:index"
        // We need to group them by receiptId
        const receiptGroups: Record<string, number[]> = {};

        for (const id of transactionIds) {
            if (!id.startsWith("pending:")) continue;
            const parts = id.split(":");
            if (parts.length !== 3) continue;
            const receiptId = parts[1];
            const idx = parseInt(parts[2], 10);

            if (!receiptGroups[receiptId]) {
                receiptGroups[receiptId] = [];
            }
            receiptGroups[receiptId].push(idx);
        }

        const receiptIds = Object.keys(receiptGroups);
        if (receiptIds.length === 0) {
            return NextResponse.json({ success: true, updatedCount: 0 });
        }

        const pendingReceipts = await db.query.receipts.findMany({
            where: and(
                eq(receipts.ledgerId, ledgerId),
                inArray(receipts.id, receiptIds),
                eq(receipts.status, "to_confirm")
            )
        });

        const allCategories = await db.query.categories.findMany({
            where: eq(categories.ledgerId, ledgerId),
        });

        let updatedCount = 0;

        for (const receipt of pendingReceipts) {
            const indices = receiptGroups[receipt.id];
            if (!receipt.proposedTransactions || !Array.isArray(receipt.proposedTransactions)) continue;

            const proposedTxs = receipt.proposedTransactions as unknown as ProposedTransaction[];

            for (const idx of indices) {
                const tx = proposedTxs[idx];
                if (!tx) continue;

                const categoryName = tx.category;
                const category = allCategories.find(c => c.name === categoryName);

                await db.insert(transactions).values({
                    ledgerId: receipt.ledgerId,
                    categoryId: category?.id || null,
                    receiptId: receipt.id,
                    amount: tx.amount?.toString() || "0",
                    currency: tx.currency || "CNY",
                    itemName: tx.itemName || "未分类",
                    description: tx.notes || null,
                    transactionDate: tx.transactionDate ? new Date(tx.transactionDate) : new Date(receipt.createdAt),
                });
                updatedCount++;
            }

            await db.update(receipts)
                .set({ status: 'completed' })
                .where(eq(receipts.id, receipt.id));
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
