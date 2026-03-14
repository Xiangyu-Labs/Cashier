
import { type ReactNode } from "react";
import { redirect } from "@/i18n/routing";
import { getTranslations, getLocale } from "next-intl/server";
import { auth } from "@/auth";
import { createLedgerAction } from "@/features/ledger/server/actions/create";
import { db } from "@/lib/db";
import { ledgers } from "@/lib/db/schema";
import { eq, desc, and, isNull } from "drizzle-orm";
import { serializeLedger } from "@/lib/serialization/utils";

// Inline data access - simplified architecture (no services layer)
async function getLedgers(userId: string) {
    const rows = await db.query.ledgers.findMany({
        where: and(eq(ledgers.userId, userId), isNull(ledgers.deletedAt)),
        orderBy: [desc(ledgers.createdAt)],
    });
    return rows.map(serializeLedger);
}

export default async function HomePage(): Promise<ReactNode> {
  const session = await auth();
  const locale = await getLocale();
  const t = await getTranslations("HomePage");

  // Redirect if not authenticated (though middleware should handle this)
  if (!session?.user?.id) {
    redirect({ href: "/login", locale });
  }

  // 1. Fetch ledgers directly from DB (No API call)
  if (!session?.user?.id) return null; // Should be handled by redirect above, but satisfies TS
  const ledgers = await getLedgers(session.user.id);

  // 2. Check default ledger from session
  if (session.user.defaultLedgerId) {
    redirect({ href: `/ledger/${session.user.defaultLedgerId}`, locale });
  }

  // 3. Redirect to first existing ledger
  if (ledgers.length > 0) {
    redirect({ href: `/ledger/${ledgers[0].id}`, locale });
  }

  // 4. Auto-create default ledger (Server Action called directly)
  try {
    const newLedger = await createLedgerAction({
      name: t("defaultLedgerName"),
      aiLanguage: locale
    });

    redirect({ href: `/ledger/${newLedger.id}`, locale });
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
}


