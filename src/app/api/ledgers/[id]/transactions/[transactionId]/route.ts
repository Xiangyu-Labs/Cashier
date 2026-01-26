import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { transactions } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { z } from "zod";

const updateTransactionSchema = z.object({
  categoryId: z.string().uuid().nullable().optional(),
  amount: z.number().nonnegative().optional(),
  currency: z.string().nullable().optional(),
  itemName: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  transactionDate: z.string().nullable().optional(),
  status: z.enum(["pending", "confirmed"]).optional(),
});

type RouteParams = { params: Promise<{ id: string; transactionId: string }> };

// PATCH /api/ledgers/[id]/transactions/[transactionId] - 更新交易
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: ledgerId, transactionId } = await params;
    const body = await request.json();
    const validated = updateTransactionSchema.parse(body);

    const updateData: Record<string, unknown> = {};
    if (validated.categoryId !== undefined) updateData.categoryId = validated.categoryId;
    if (validated.amount !== undefined) updateData.amount = validated.amount.toString();
    if (validated.currency !== undefined) updateData.currency = validated.currency;
    if (validated.itemName !== undefined) updateData.itemName = validated.itemName;
    if (validated.description !== undefined) updateData.description = validated.description;
    if (validated.transactionDate !== undefined) {
      updateData.transactionDate = validated.transactionDate
        ? new Date(validated.transactionDate)
        : null;
    }
    if (validated.status !== undefined) updateData.status = validated.status;

    const [updated] = await db
      .update(transactions)
      .set(updateData)
      .where(
        and(
          eq(transactions.id, transactionId),
          eq(transactions.ledgerId, ledgerId)
        )
      )
      .returning();

    if (!updated) {
      return NextResponse.json(
        { error: "Transaction not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.issues },
        { status: 400 }
      );
    }
    console.error("Failed to update transaction:", error);
    return NextResponse.json(
      { error: "Failed to update transaction" },
      { status: 500 }
    );
  }
}

// DELETE /api/ledgers/[id]/transactions/[transactionId] - 删除交易
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: ledgerId, transactionId } = await params;

    const [deleted] = await db
      .delete(transactions)
      .where(
        and(
          eq(transactions.id, transactionId),
          eq(transactions.ledgerId, ledgerId)
        )
      )
      .returning();

    if (!deleted) {
      return NextResponse.json(
        { error: "Transaction not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete transaction:", error);
    return NextResponse.json(
      { error: "Failed to delete transaction" },
      { status: 500 }
    );
  }
}
