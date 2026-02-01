
import { auth } from "@/auth";
import { getEntryCategories } from "@/services/categories";
import { CategoriesPageClient } from "@/components/ledger/CategoriesPageClient";
import { redirect } from "@/i18n/routing";

export default async function CategoriesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: ledgerId } = await params;
  const session = await auth();

  if (!session?.user?.id) {
    redirect({ href: "/login", locale: "en" });
  }

  const categories = await getEntryCategories(ledgerId);

  return (
    <CategoriesPageClient
      ledgerId={ledgerId}
      categories={categories}
    />
  );
}
