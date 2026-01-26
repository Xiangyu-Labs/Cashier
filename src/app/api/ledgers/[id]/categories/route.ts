import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { categories } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { z } from "zod";

const createCategorySchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  icon: z.string().optional(),
  sortOrder: z.number().optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

// GET /api/ledgers/[id]/categories - 获取所有全局分类 (Legacy route kept for compatibility)
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const allCategories = await db.query.categories.findMany({
      orderBy: (categories, { asc }) => [asc(categories.sortOrder)],
    });
    return NextResponse.json(allCategories);
  } catch (error) {
    console.error("Failed to fetch categories:", error);
    return NextResponse.json(
      { error: "Failed to fetch categories" },
      { status: 500 }
    );
  }
}

// POST /api/ledgers/[id]/categories - 创建新全局分类 (Legacy route kept for compatibility)
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const body = await request.json();
    const validated = createCategorySchema.parse(body);

    // 获取当前最大 sortOrder
    const existingCategories = await db.query.categories.findMany({
      orderBy: (categories, { desc }) => [desc(categories.sortOrder)],
      limit: 1,
    });
    const maxSortOrder = existingCategories[0]?.sortOrder ?? 0;

    const [newCategory] = await db
      .insert(categories)
      .values({
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
