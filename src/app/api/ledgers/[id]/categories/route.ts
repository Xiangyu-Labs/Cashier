import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { categories } from "@/lib/db/schema";
import { z } from "zod";

const createCategorySchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  icon: z.string().optional(),
  sortOrder: z.number().optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

// GET /api/ledgers/[id]/categories - 获取账本分类
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const ledgerCategories = await db.query.categories.findMany({
      where: (categories, { eq }) => eq(categories.ledgerId, id),
      orderBy: (categories, { asc }) => [asc(categories.sortOrder)],
    });
    return NextResponse.json(ledgerCategories);
  } catch (error) {
    console.error("Failed to fetch categories:", error);
    return NextResponse.json(
      { error: "Failed to fetch categories" },
      { status: 500 }
    );
  }
}

// POST /api/ledgers/[id]/categories - 创建新分类
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();
    const validated = createCategorySchema.parse(body);

    // 获取当前账本最大 sortOrder
    const existingCategories = await db.query.categories.findMany({
      where: (categories, { eq }) => eq(categories.ledgerId, id),
      orderBy: (categories, { desc }) => [desc(categories.sortOrder)],
      limit: 1,
    });
    const maxSortOrder = existingCategories[0]?.sortOrder ?? 0;

    const [newCategory] = await db
      .insert(categories)
      .values({
        ledgerId: id,
        name: validated.name,
        description: validated.description,
        icon: validated.icon,
        sortOrder: validated.sortOrder ?? maxSortOrder + 1,
      })
      .returning();

    return NextResponse.json(newCategory, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.issues },
        { status: 400 }
      );
    }
    console.error("Failed to create category:", error);
    return NextResponse.json(
      { error: "Failed to create category" },
      { status: 500 }
    );
  }
}
