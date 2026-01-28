import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { receipts } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { logger } from "@/lib/logger";

type RouteParams = { params: Promise<{ id: string; receiptId: string }> };

export async function POST(request: NextRequest, { params }: RouteParams) {
    try {
        const { id: ledgerId, receiptId } = await params;

        // Verify receipt exists and belongs to ledger
        const receipt = await db.query.receipts.findFirst({
            where: and(
                eq(receipts.id, receiptId),
                eq(receipts.ledgerId, ledgerId)
            )
        });

        if (!receipt) {
            return NextResponse.json({ error: "Receipt not found" }, { status: 404 });
        }

        // Update receipt status to queued
        await db
            .update(receipts)
            .set({
                status: "queued",
                error: null,
                aiResponse: null,
                // We do typically want to update the timestamp so we know when the *retry* happened, 
                // but for queue ordering purposes (FIFO), we might want to keep the original creation time 
                // so it gets prioritized if it's old. 
                // Logic in queue.ts: orderBy: [asc(receipts.createdAt)]
                // So keeping createdAt means it will be processed asap (since it's old).
            })
            .where(eq(receipts.id, receiptId));

        // Trigger processing using the GPT task system
        const { createTask } = await import("@/lib/gpt");
        const { TASK_TYPE_PARSE_RECEIPT } = await import("@/lib/tasks");
        const { ledgers: ledgerTable } = await import("@/lib/db/schema");

        const ledger = await db.query.ledgers.findFirst({
            where: eq(ledgerTable.id, ledgerId),
        });

        if (ledger) {
            await createTask({
                type: TASK_TYPE_PARSE_RECEIPT,
                title: receipt.text ? `重试解析: ${receipt.text.slice(0, 20)}...` : "重试解析图片账单",
                ledgerId,
                entityId: receiptId,
                entityType: "receipt",
                input: {
                    receiptId,
                    text: receipt.text || undefined,
                    imageUrls: receipt.imageUrls as string[] || [],
                    categories: await db.query.categories.findMany({
                        where: (c, { eq, or, isNull }) => or(eq(c.ledgerId, ledgerId), isNull(c.ledgerId))
                    }),
                    settings: {
                        mergeSimilarItems: ledger.mergeSimilarItems,
                        autoRecognizeDate: ledger.autoRecognizeDate,
                        autoConfirm: ledger.autoConfirm,
                    },
                },
            });
        }

        return NextResponse.json({
            success: true,
            message: "Receipt requeued for processing",
        });
    } catch (error) {
        logger.error({ error }, "Failed to retry receipt");
        return NextResponse.json(
            { error: "Failed to retry receipt" },
            { status: 500 }
        );
    }
}

