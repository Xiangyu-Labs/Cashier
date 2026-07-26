"use client";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertCircle, RefreshCcw } from "lucide-react";
import { useTranslations } from "next-intl";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("Error");

  useEffect(() => {
    // Log the error to an error reporting service
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-bg">
      <div className="max-w-md w-full bg-surface border border-border rounded-2xl p-8 shadow-xl text-center space-y-6">
        <div className="mx-auto w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center text-destructive">
          <AlertCircle className="w-10 h-10" />
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-text">{t("title")}</h1>
          <p className="text-muted-foreground">{t("description", { message: t("title") })}</p>
          {error.digest != null && (
            <p className="text-xs font-mono bg-surface2 p-2 rounded text-muted-foreground mt-4">
              {t("errorId", { id: error.digest })}
            </p>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <Button className="flex-1 gap-2 h-11" onClick={() => reset()}>
            <RefreshCcw className="w-4 h-4" />
            {t("retry")}
          </Button>
          <Button
            variant="outline"
            className="flex-1 h-11"
            onClick={() => (window.location.href = "/")}
          >
            {t("goHome")}
          </Button>
        </div>
      </div>
    </div>
  );
}
