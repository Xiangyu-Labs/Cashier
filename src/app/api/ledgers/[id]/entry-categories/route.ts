import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireLedgerAccess } from "@/lib/auth/helpers";
import { LedgerScope } from "@/lib/scope/ledger-scope";
import { entryCategories } from "@/lib/db/schema";
import { asc, desc } from "drizzle-orm";

const createCategorySchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  icon: z.string().optional(),
  sortOrder: z.number().optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

// GET /api/ledgers/[id]/entry-categories - 获取账本分类
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    // Verify user owns this ledger
    const { error } = await requireLedgerAccess(id);
    if (error) return error;

    const scope = new LedgerScope(id);
    const ledgerCategories = await scope.categories.findMany({
      orderBy: asc(entryCategories.sortOrder),
    });
    return NextResponse.json(ledgerCategories);
  } catch (error) {
    console.error("Failed to fetch entry categories:", error);
    return NextResponse.json(
      { error: "Failed to fetch entry categories" },
      { status: 500 }
    );
  }
}

// POST /api/ledgers/[id]/entry-categories - 创建新分类
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    // Verify user owns this ledger
    const { error } = await requireLedgerAccess(id);
    if (error) return error;

    const body = await request.json();
    const validated = createCategorySchema.parse(body);

    const scope = new LedgerScope(id);
    const existingCategories = await scope.categories.findMany({
      orderBy: desc(entryCategories.sortOrder),
      limit: 1,
    });
    const maxSortOrder = existingCategories[0]?.sortOrder ?? 0;

    const newCategory = await scope.categories.create({
      name: validated.name,
      description: validated.description ?? null,
      icon: validated.icon ?? null,
      sortOrder: validated.sortOrder ?? maxSortOrder + 1,
    } as any);

    return NextResponse.json(newCategory, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.issues },
        { status: 400 }
      );
    }
    console.error("Failed to create entry category:", error);
    return NextResponse.json(
      { error: "Failed to create entry category" },
      { status: 500 }
    );
  }
}
