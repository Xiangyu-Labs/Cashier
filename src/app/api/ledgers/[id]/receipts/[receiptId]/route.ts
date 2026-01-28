import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { receipts, transactions } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

type RouteParams = { params: Promise<{ id: string; receiptId: string }> };

export async function DELETE(request: NextRequest, { params }: RouteParams) {
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

        // Delete associated transactions first
        // Note: Schema has ON DELETE SET NULL, but we want to delete them for this specific action
        await db
            .delete(transactions)
            .where(eq(transactions.receiptId, receiptId));

        // Delete associated tasks first (avoid zombie GPT processing)
        const { gptTasks } = await import("@/lib/db/schema");
        await db
            .delete(gptTasks)
            .where(and(
                eq(gptTasks.entityId, receiptId),
                eq(gptTasks.entityType, "receipt")
            ));

        // Delete the receipt
        await db
            .delete(receipts)
            .where(eq(receipts.id, receiptId));

        return new NextResponse(null, { status: 204 });
    } catch (error) {
        console.error("Failed to delete receipt:", error);
        return NextResponse.json(
            { error: "Failed to delete receipt" },
            { status: 500 }
        );
    }
}
