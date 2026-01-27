import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { receipts } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { processReceiptQueue } from "@/lib/queue";

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

        // Trigger processing
        processReceiptQueue().catch((err) => {
            console.error("Background processing failed to start:", err);
        });

        return NextResponse.json({
            success: true,
            message: "Receipt requeued for processing",
        });
    } catch (error) {
        console.error("Failed to retry receipt:", error);
        return NextResponse.json(
            { error: "Failed to retry receipt" },
            { status: 500 }
        );
    }
}
