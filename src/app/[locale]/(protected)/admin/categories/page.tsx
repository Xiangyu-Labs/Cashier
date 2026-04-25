import { getLocale, getTranslations } from "next-intl/server";
import { listAdminCategories } from "@/modules/admin/queries";
import { AdminCategoriesList } from "@/modules/admin/ui";

interface AdminCategoriesPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function getSingleSearchParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

export default async function AdminCategoriesPage({ searchParams }: AdminCategoriesPageProps) {
  const locale = await getLocale();
  const t = await getTranslations("AdminCategories");
  const resolvedSearchParams = await searchParams;

  const expandedCategoryId = getSingleSearchParam(resolvedSearchParams.detail);
  const categories = await listAdminCategories();

  return (
    <AdminCategoriesList
      locale={locale}
      items={categories.items}
      hasAnyCategories={categories.hasAnyCategories}
      expandedCategoryId={expandedCategoryId ?? null}
      labels={{
        title: t("title"),
        description: t("description"),
        id: t("id"),
        ledgerId: t("ledgerId"),
        name: t("name"),
        descriptionColumn: t("description"),
        sortOrder: t("sortOrder"),
        isEditable: t("isEditable"),
        details: t("details"),
        detailsColumn: t("detailsColumn"),
        hideDetails: t("hideDetails"),
        emptyTitle: t("emptyTitle"),
        emptyDescription: t("emptyDescription"),
        icon: t("icon"),
        createdAt: t("createdAt"),
        updatedAt: t("updatedAt"),
        deletedAt: t("deletedAt"),
        notAvailable: t("notAvailable"),
        yes: t("yes"),
        no: t("no"),
      }}
    />
  );
}
