import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/modules/admin/access";
import { parseListAdminCategoriesInput } from "@/modules/admin/contract-schemas";
import type {
  AdminCategoryListItem,
  ListAdminCategoriesInput,
  ListAdminCategoriesResult,
} from "@/modules/admin/contracts";
import { entryCategories } from "@/persistence";

export async function listAdminCategories(
  input: ListAdminCategoriesInput = {}
): Promise<ListAdminCategoriesResult> {
  await requireSuperAdmin();

  const validated = parseListAdminCategoriesInput(input);
  const conditions = [isNull(entryCategories.deletedAt)];

  if (validated.ledgerId != null) {
    conditions.push(eq(entryCategories.ledgerId, validated.ledgerId));
  }

  const rows = await db
    .select({
      id: entryCategories.id,
      ledgerId: entryCategories.ledgerId,
      name: entryCategories.name,
      description: entryCategories.description,
      sortOrder: entryCategories.sortOrder,
      isEditable: entryCategories.isEditable,
      createdAt: entryCategories.createdAt,
    })
    .from(entryCategories)
    .where(and(...conditions))
    .orderBy(asc(entryCategories.sortOrder), desc(entryCategories.createdAt));

  const hasAnyCategories = rows.length > 0;

  const items: AdminCategoryListItem[] = rows.map((row) => ({
    id: row.id,
    ledgerId: row.ledgerId,
    name: row.name,
    description: row.description,
    sortOrder: row.sortOrder,
    isEditable: row.isEditable,
    createdAt: row.createdAt,
  }));

  return { items, hasAnyCategories };
}
