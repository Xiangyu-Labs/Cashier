import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ledgers, categories, DEFAULT_CATEGORIES } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

const createLedgerSchema = z.object({
  name: z.string().min(1, "Name is required"),
});

// GET /api/ledgers - 获取所有账本
export async function GET() {
  try {
    const allLedgers = await db.query.ledgers.findMany({
      orderBy: (ledgers, { desc }) => [desc(ledgers.createdAt)],
    });
    return NextResponse.json(allLedgers);
  } catch (error) {
    console.error("Failed to fetch ledgers:", error);
    return NextResponse.json(
      { error: "Failed to fetch ledgers" },
      { status: 500 }
    );
  }
}

// POST /api/ledgers - 创建新账本
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = createLedgerSchema.parse(body);

    // 创建账本
    const [newLedger] = await db
      .insert(ledgers)
      .values({
        name: validated.name,
      })
      .returning();

    return NextResponse.json(newLedger, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.issues },
        { status: 400 }
      );
    }
    console.error("Failed to create ledger:", error);
    return NextResponse.json(
      { error: "Failed to create ledger" },
      { status: 500 }
    );
  }
}
