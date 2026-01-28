import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { entryCategories } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

const updateCategorySchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  icon: z.string().optional(),
  sortOrder: z.number().optional(),
});

type RouteParams = { params: Promise<{ id: string; categoryId: string }> };

// PATCH /api/ledgers/[id]/entry-categories/[categoryId] - 更新分类
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { categoryId } = await params;
    const body = await request.json();
    const validated = updateCategorySchema.parse(body);

    const [updated] = await db
      .update(entryCategories)
      .set({
        ...validated,
        updatedAt: new Date(),
      })
      .where(eq(entryCategories.id, categoryId))
      .returning();

    if (!updated) {
      return NextResponse.json(
        { error: "Category not found" },
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
    console.error("Failed to update category:", error);
    return NextResponse.json(
      { error: "Failed to update category" },
      { status: 500 }
    );
  }
}

// DELETE /api/ledgers/[id]/entry-categories/[categoryId] - 删除分类
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { categoryId } = await params;
    const [deleted] = await db
      .delete(entryCategories)
      .where(eq(entryCategories.id, categoryId))
      .returning();

    if (!deleted) {
      return NextResponse.json(
        { error: "Category not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete category:", error);
    return NextResponse.json(
      { error: "Failed to delete category" },
      { status: 500 }
    );
  }
}
