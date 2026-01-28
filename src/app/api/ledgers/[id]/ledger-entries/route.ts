import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ledgerEntries, sourceDocuments, entryCategories } from "@/lib/db/schema";
import { eq, and, gte, lte, or, isNull, lt } from "drizzle-orm";
import { z } from "zod";
import { logger } from "@/lib/logger";

const querySchema = z.object({
  categoryId: z.string().uuid().optional(),
  limit: z.coerce.number().positive().optional().default(50),
  offset: z.coerce.number().nonnegative().optional().default(0),
  cursor: z.string().optional(), // transactionDate or createdAt timestamp
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  status: z.enum(["pending", "confirmed"]).optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

// GET /api/ledgers/[id]/ledger-entries - 获取账项列表
export async function GET(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const { id: ledgerId } = await params;
    const searchParams = request.nextUrl.searchParams;

    const query = querySchema.parse({
      categoryId: searchParams.get("categoryId") || undefined,
      limit: searchParams.get("limit") || undefined,
      offset: searchParams.get("offset") || undefined,
      cursor: searchParams.get("cursor") || undefined,
      startDate: searchParams.get("startDate") || undefined,
      endDate: searchParams.get("endDate") || undefined,
      status: searchParams.get("status") || undefined,
    });

    // If querying for pending ledger entries, fetch from source documents
    if (query.status === "pending") {
      // 1. Fetch source documents with 'to_confirm' status
      const pendingDocs = await db.query.sourceDocuments.findMany({
        where: and(
          eq(sourceDocuments.ledgerId, ledgerId),
          eq(sourceDocuments.status, "to_confirm")
        ),
        orderBy: (sourceDocuments, { desc }) => [desc(sourceDocuments.createdAt)],
      });

      // 2. Fetch all categories for mapping
      const allCategories = await db.query.entryCategories.findMany({
        where: eq(entryCategories.ledgerId, ledgerId),
      });

      // 3. Map to LedgerEntry objects
      interface ProposedLedgerEntry {
        category?: string;
        amount?: number | string;
        currency?: string;
        itemName?: string;
        notes?: string;
        transactionDate?: string;
      }

      interface PendingLedgerEntry {
        id: string;
        ledgerId: string;
        categoryId: string | null;
        sourceDocumentId: string;
        amount: string;
        currency: string;
        itemName: string;
        description: string | null;
        transactionDate: Date;
        createdAt: Date;
        updatedAt: Date;
        category: unknown;
        sourceDocument: unknown;
      }

      const pendingEntries: PendingLedgerEntry[] = [];

      for (const doc of pendingDocs) {
        if (!doc.proposedLedgerEntries || !Array.isArray(doc.proposedLedgerEntries)) continue;

        const proposedEntries = doc.proposedLedgerEntries as unknown as ProposedLedgerEntry[];

        proposedEntries.forEach((pent, index) => {
          // Find category object
          const categoryName = pent.category;
          const category = allCategories.find(c => c.name === categoryName) || null;

          pendingEntries.push({
            id: `pending:${doc.id}:${index}`, // Synthesized ID
            ledgerId: doc.ledgerId,
            categoryId: category?.id || null,
            sourceDocumentId: doc.id,
            amount: pent.amount?.toString() || "0",
            currency: pent.currency || "CNY",
            itemName: pent.itemName || "未分类",
            description: pent.notes || null,
            transactionDate: pent.transactionDate ? new Date(pent.transactionDate) : doc.createdAt,
            createdAt: doc.createdAt,
            updatedAt: doc.createdAt,
            // Relations
            category: category,
            sourceDocument: doc,
          });
        });
      }

      // Sort by createdAt desc
      pendingEntries.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

      return NextResponse.json({ items: pendingEntries });
    }

    const conditions = [eq(ledgerEntries.ledgerId, ledgerId)];

    if (query.categoryId) {
      conditions.push(eq(ledgerEntries.categoryId, query.categoryId));
    }

    if (query.startDate) {
      const startDate = new Date(query.startDate);
      const dateCondition = or(
        gte(ledgerEntries.transactionDate, startDate),
        and(
          isNull(ledgerEntries.transactionDate),
          gte(ledgerEntries.createdAt, startDate)
        )
      );
      if (dateCondition) {
        conditions.push(dateCondition);
      }
    }

    if (query.endDate) {
      const endDate = new Date(query.endDate);
      const dateCondition = or(
        lte(ledgerEntries.transactionDate, endDate),
        and(
          isNull(ledgerEntries.transactionDate),
          lte(ledgerEntries.createdAt, endDate)
        )
      );
      if (dateCondition) {
        conditions.push(dateCondition);
      }
    }

    // Cursor-based pagination logic
    if (query.cursor) {
      const cursorDate = new Date(query.cursor);
      const dateCondition = or(
        lt(ledgerEntries.transactionDate, cursorDate),
        and(
          isNull(ledgerEntries.transactionDate),
          lt(ledgerEntries.createdAt, cursorDate)
        )
      );
      if (dateCondition) {
        conditions.push(dateCondition);
      }
    }

    const result = await db.query.ledgerEntries.findMany({
      where: and(...conditions),
      with: {
        category: true,
        sourceDocument: true,
      },
      orderBy: (ledgerEntries, { desc }) => [desc(ledgerEntries.transactionDate), desc(ledgerEntries.createdAt)],
      limit: query.limit + 1,
      offset: query.offset,
    });

    let nextCursor = null;
    if (result.length > query.limit) {
      const nextItem = result.pop();
      if (nextItem) {
        const nextDate = nextItem.transactionDate || nextItem.createdAt;
        nextCursor = new Date(nextDate).toISOString();
      }
    }

    return NextResponse.json({
      items: result,
      nextCursor
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid query parameters", details: error.issues },
        { status: 400 }
      );
    }
    logger.error({ error }, "Failed to fetch ledger entries");
    return NextResponse.json(
      { error: "Failed to fetch ledger entries" },
      { status: 500 }
    );
  }
}
