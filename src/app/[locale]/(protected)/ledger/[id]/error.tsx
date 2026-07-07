"use client";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertCircle, RefreshCcw, LayoutDashboard } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";

export default function LedgerError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("Error");
  const tLedger = useTranslations("LedgerError");

  useEffect(() => {
    console.error("Ledger Error:", error);
  }, [error]);

  return (
    <div className="h-[calc(100vh-4rem)] flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-surface border border-border rounded-2xl p-8 shadow-sm text-center space-y-6">
        <div className="mx-auto w-16 h-16 bg-warning/10 rounded-full flex items-center justify-center text-warning">
          <AlertCircle className="w-10 h-10" />
        </div>

        <div className="space-y-2">
          <h1 className="text-xl font-bold">{tLedger("title")}</h1>
          <p className="text-muted-foreground text-sm">{tLedger("description")}</p>
        </div>

        <div className="flex flex-col gap-3">
          <Button className="w-full gap-2" onClick={() => reset()}>
            <RefreshCcw className="w-4 h-4" />
            {t("retry")}
          </Button>
          <Button variant="outline" className="w-full gap-2" asChild>
            <Link href="/">
              <LayoutDashboard className="w-4 h-4" />
              {tLedger("backToHome")}
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
