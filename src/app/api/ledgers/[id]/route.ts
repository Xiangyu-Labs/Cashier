import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ledgers } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireLedgerAccess } from "@/lib/auth/helpers";

const updateLedgerSchema = z.object({
  name: z.string().min(1).optional(),
  aiLanguage: z.string().optional(),
  currencies: z.array(z.string()).optional(),
  mainCurrency: z.string().optional(),
  autoRecognizeDate: z.boolean().optional(),
  collapseProcessingDefault: z.boolean().optional(),
  collapseBillsDefault: z.boolean().optional(),
  mergeSimilarItems: z.boolean().optional(),
  aiCustomPrompt: z.string().optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

// GET /api/ledgers/[id] - 获取单个账本
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    // Verify user owns this ledger
    const { ledger, error } = await requireLedgerAccess(id);
    if (error) return error;

    return NextResponse.json(ledger);
  } catch (error) {
    console.error("Failed to fetch ledger:", error);
    return NextResponse.json(
      { error: "Failed to fetch ledger" },
      { status: 500 }
    );
  }
}

// PATCH /api/ledgers/[id] - 更新账本
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    // Verify user owns this ledger
    const { error } = await requireLedgerAccess(id);
    if (error) return error;

    const body = await request.json();
    const validated = updateLedgerSchema.parse(body);

    const [updated] = await db
      .update(ledgers)
      .set({
        ...validated,
        updatedAt: new Date(),
      })
      .where(eq(ledgers.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Ledger not found" }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.issues },
        { status: 400 }
      );
    }
    console.error("Failed to update ledger:", error);
    return NextResponse.json(
      { error: "Failed to update ledger" },
      { status: 500 }
    );
  }
}

// DELETE /api/ledgers/[id] - 删除账本
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    // Verify user owns this ledger
    const { error } = await requireLedgerAccess(id);
    if (error) return error;

    const [deleted] = await db
      .delete(ledgers)
      .where(eq(ledgers.id, id))
      .returning();

    if (!deleted) {
      return NextResponse.json({ error: "Ledger not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete ledger:", error);
    return NextResponse.json(
      { error: "Failed to delete ledger" },
      { status: 500 }
    );
  }
}
