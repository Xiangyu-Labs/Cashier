import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ledgers, entryCategories } from "@/lib/db/schema";
import defaultLedger from "@/config/default-ledger.json";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { auth } from "@/auth";
import { eq } from "drizzle-orm";

const createLedgerSchema = z.object({
  name: z.string().min(1, "Name is required"),
  aiLanguage: z.string().optional(),
});

// GET /api/ledgers - 获取所有账本
export const GET = auth(async function GET(req): Promise<NextResponse> {
  try {
    if (!req.auth?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const allLedgers = await db.query.ledgers.findMany({
      where: eq(ledgers.userId, req.auth.user.id),
      orderBy: (ledgers, { desc }) => [desc(ledgers.createdAt)],
    });
    return NextResponse.json(allLedgers);
  } catch (error) {
    logger.error({ error }, "Failed to fetch ledgers");
    return NextResponse.json(
      { error: "Failed to fetch ledgers" },
      { status: 500 }
    );
  }
});

// POST /api/ledgers - 创建新账本
export const POST = auth(async function POST(request): Promise<NextResponse> {
  try {
    if (!request.auth?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const validated = createLedgerSchema.parse(body);

    // Create ledger
    const [newLedger] = await db
      .insert(ledgers)
      .values({
        userId: request.auth.user.id,
        name: validated.name,
        aiLanguage: validated.aiLanguage || defaultLedger.settings.aiLanguage,
        currencies: defaultLedger.settings.currencies,
        autoRecognizeDate: defaultLedger.settings.autoRecognizeDate,
        collapseProcessingDefault: defaultLedger.settings.collapseProcessingDefault,
        mergeSimilarItems: defaultLedger.settings.mergeSimilarItems,
      })
      .returning();

    // Seed categories for the new ledger
    if (defaultLedger.categories.length > 0) {
      await db.insert(entryCategories).values(
        defaultLedger.categories.map((cat) => ({
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
    logger.error({ error }, "Failed to create ledger");
    return NextResponse.json(
      { error: "Failed to create ledger" },
      { status: 500 }
    );
  }
});
