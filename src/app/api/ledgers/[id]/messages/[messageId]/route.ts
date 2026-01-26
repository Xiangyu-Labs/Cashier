import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { inputMessages, transactions } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

type RouteParams = { params: Promise<{ id: string; messageId: string }> };

export async function DELETE(request: NextRequest, { params }: RouteParams) {
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

        // Delete associated transactions first
        // Note: Schema has ON DELETE SET NULL, but we want to delete them for this specific action
        await db
            .delete(transactions)
            .where(eq(transactions.inputMessageId, messageId));

        // Delete the message
        await db
            .delete(inputMessages)
            .where(eq(inputMessages.id, messageId));

        return new NextResponse(null, { status: 204 });
    } catch (error) {
        console.error("Failed to delete message:", error);
        return NextResponse.json(
            { error: "Failed to delete message" },
            { status: 500 }
        );
    }
}
