import { getLocale, getTranslations } from "next-intl/server";
import { listAdminOTPTokens } from "@/modules/admin/queries";
import { AdminOTPTokensList } from "@/modules/admin/ui";

interface AdminOTPTokensPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function getSingleSearchParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

export default async function AdminOTPTokensPage({ searchParams }: AdminOTPTokensPageProps) {
  const locale = await getLocale();
  const t = await getTranslations("AdminOTPTokens");
  const resolvedSearchParams = await searchParams;

  const listSearchParams = {
    email: getSingleSearchParam(resolvedSearchParams.email),
    verified: getSingleSearchParam(resolvedSearchParams.verified) as "yes" | "no" | undefined,
    cursor: getSingleSearchParam(resolvedSearchParams.cursor),
    limit: getSingleSearchParam(resolvedSearchParams.limit),
  };

  const expandedTokenId = getSingleSearchParam(resolvedSearchParams.detail);
  const tokens = await listAdminOTPTokens(listSearchParams);

  return (
    <AdminOTPTokensList
      locale={locale}
      items={tokens.items}
      hasAnyOTPTokens={tokens.hasAnyOTPTokens}
      nextCursor={tokens.nextCursor}
      currentCursor={getSingleSearchParam(resolvedSearchParams.cursor) ?? null}
      expandedTokenId={expandedTokenId ?? null}
      labels={{
        title: t("title"),
        description: t("description"),
        email: t("email"),
        expires: t("expires"),
        attempts: t("attempts"),
        isVerified: t("isVerified"),
        ipAddress: t("ipAddress"),
        createdAt: t("createdAt"),
        details: t("details"),
        detailsColumn: t("detailsColumn"),
        hideDetails: t("hideDetails"),
        emptyTitle: t("emptyTitle"),
        emptyDescription: t("emptyDescription"),
        filteredEmptyTitle: t("filteredEmptyTitle"),
        filteredEmptyDescription: t("filteredEmptyDescription"),
        nextPage: t("nextPage"),
        tokenHash: t("tokenHash"),
        lockedUntil: t("lockedUntil"),
        lastAttemptAt: t("lastAttemptAt"),
        verifiedAt: t("verifiedAt"),
        notAvailable: t("notAvailable"),
        yes: t("yes"),
        no: t("no"),
      }}
    />
  );
}
