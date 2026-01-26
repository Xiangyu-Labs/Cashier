import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { inputMessages } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { processMessageQueue } from "@/lib/queue";

type RouteParams = { params: Promise<{ id: string; messageId: string }> };

export async function POST(request: NextRequest, { params }: RouteParams) {
    try {
        const { id: ledgerId, messageId } = await params;

        // Verify message exists and belongs to ledger
        const message = await db.query.inputMessages.findFirst({
            where: and(
                eq(inputMessages.id, messageId),
                eq(inputMessages.ledgerId, ledgerId)
            )
        });

        if (!message) {
            return NextResponse.json({ error: "Message not found" }, { status: 404 });
        }

        // Update message status to queued
        await db
            .update(inputMessages)
            .set({
                status: "queued",
                error: null,
                aiResponse: null,
                // We do typically want to update the timestamp so we know when the *retry* happened, 
                // but for queue ordering purposes (FIFO), we might want to keep the original creation time 
                // so it gets prioritized if it's old. 
                // Logic in queue.ts: orderBy: [asc(inputMessages.createdAt)]
                // So keeping createdAt means it will be processed asap (since it's old).
            })
            .where(eq(inputMessages.id, messageId));

        // Trigger processing
        processMessageQueue().catch((err) => {
            console.error("Background processing failed to start:", err);
        });

        return NextResponse.json({
            success: true,
            message: "Message requeued for processing",
        });
    } catch (error) {
        console.error("Failed to retry message:", error);
        return NextResponse.json(
            { error: "Failed to retry message" },
            { status: 500 }
        );
    }
}
