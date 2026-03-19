import { type ReactNode } from "react";
import { redirect } from "@/i18n/routing";
import { getTranslations, getLocale } from "next-intl/server";
import { auth } from "@/auth";
import { resolveHome } from "@/modules/workspace/use-cases";

export default async function HomePage(): Promise<ReactNode> {
  const session = await auth();
  const locale = await getLocale();
  const t = await getTranslations("HomePage");

  // Redirect if not authenticated (though proxy should handle this)
  if (session?.user?.id == null) {
    redirect({ href: "/login", locale });
  }

  if (session?.user?.id == null) return null;

  let result;
  try {
    result = await resolveHome({
      userId: session.user.id,
      locale,
    });
  } catch (error) {
    console.error("Failed to auto-create ledger:", error);
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg">
        <div className="text-center">
          <p className="mt-4 text-muted">{t("createFailed")}</p>
        </div>
      </div>
    );
  }

  if (result.kind === "redirect-existing" || result.kind === "redirect-created") {
    redirect({ href: `/ledger/${result.ledgerId}`, locale });
  }

  if (result.kind !== "error") {
    return null;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg">
      <div className="text-center">
        <p className="mt-4 text-muted">{result.message}</p>
      </div>
    </div>
  );
}
