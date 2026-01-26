import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ledgers, categories } from "@/lib/db/schema";
import { DEFAULT_CATEGORIES } from "@/config/default-categories";
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

    // Create ledger
    const [newLedger] = await db
      .insert(ledgers)
      .values({
        name: validated.name,
        language: "zh-CN",
        currencies: ["CNY", "USD", "EUR", "JPY", "GBP", "HKD", "TWD"],
      })
      .returning();

    // Seed categories for the new ledger
    if (DEFAULT_CATEGORIES.length > 0) {
      await db.insert(categories).values(
        DEFAULT_CATEGORIES.map((cat) => ({
          ...cat,
          ledgerId: newLedger.id,
        }))
      );
    }

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
