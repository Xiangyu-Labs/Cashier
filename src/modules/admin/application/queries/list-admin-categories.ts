import type { ListAdminCategoriesInput, ListAdminCategoriesResult } from "@/modules/admin/contracts";

export async function listAdminCategories(_input?: ListAdminCategoriesInput): Promise<ListAdminCategoriesResult> {
  return { items: [], hasAnyCategories: false };
}
