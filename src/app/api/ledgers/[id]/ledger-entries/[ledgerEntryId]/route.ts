import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ledgerEntries } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { z } from "zod";

const updateLedgerEntrySchema = z.object({
  categoryId: z.string().uuid().nullable().optional(),
  amount: z.number().nonnegative().optional(),
  currency: z.string().nullable().optional(),
  itemName: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  transactionDate: z.string().nullable().optional(),
  status: z.enum(["pending", "confirmed"]).optional(),
});

type RouteParams = { params: Promise<{ id: string; ledgerEntryId: string }> };

// PATCH /api/ledgers/[id]/ledger-entries/[ledgerEntryId] - 更新账目
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: ledgerId, ledgerEntryId } = await params;
    const body = await request.json();
    const validated = updateLedgerEntrySchema.parse(body);

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
      .update(ledgerEntries)
      .set(updateData)
      .where(
        and(
          eq(ledgerEntries.id, ledgerEntryId),
          eq(ledgerEntries.ledgerId, ledgerId)
        )
      )
      .returning();

    if (!updated) {
      return NextResponse.json(
        { error: "Ledger entry not found" },
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
    console.error("Failed to update ledger entry:", error);
    return NextResponse.json(
      { error: "Failed to update ledger entry" },
      { status: 500 }
    );
  }
}

// DELETE /api/ledgers/[id]/ledger-entries/[ledgerEntryId] - 删除账目
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: ledgerId, ledgerEntryId } = await params;

    const [deleted] = await db
      .delete(ledgerEntries)
      .where(
        and(
          eq(ledgerEntries.id, ledgerEntryId),
          eq(ledgerEntries.ledgerId, ledgerId)
        )
      )
      .returning();

    if (!deleted) {
      return NextResponse.json(
        { error: "Ledger entry not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete ledger entry:", error);
    return NextResponse.json(
      { error: "Failed to delete ledger entry" },
      { status: 500 }
    );
  }
}
