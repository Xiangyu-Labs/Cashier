"use client";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { exportLedgerEntriesAction } from "@/modules/ledger/actions";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface ExportSectionProps {
  ledgerId: string;
}

export function ExportSection({ ledgerId }: ExportSectionProps) {
  const t = useTranslations("Settings");
  const locale = useLocale();
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);

    try {
      const result = await exportLedgerEntriesAction(ledgerId, locale);

      if (result.isEmpty) {
        toast.info(t("exportEmpty"));
        return;
      }

      const blob = new Blob([result.csvContent], {
        type: "text/csv;charset=utf-8;",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = result.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success(t("exportSuccess"));
    } catch (error) {
      let errorKey = "exportFailed";

      if (error instanceof Error) {
        if (
          error.message.includes("fetch") ||
          error.message.includes("network") ||
          error.message.includes("ECONNREFUSED") ||
          error.name === "TypeError"
        ) {
          errorKey = "exportNetworkError";
        } else if (
          error.message.includes("Unauthorized") ||
          error.message.includes("403") ||
          error.message.includes("permission")
        ) {
          errorKey = "exportPermissionError";
        }
      }

      toast.error(t(errorKey));
      console.error("Export failed:", error);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h3 className="text-base font-medium">{t("exportData")}</h3>
        <p className="text-sm text-[var(--muted)]">{t("exportDataDesc")}</p>
      </div>
      <Button
        onClick={handleExport}
        disabled={isExporting}
        variant="outline"
        className="flex items-center gap-2"
      >
        {isExporting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>{t("exporting")}</span>
          </>
        ) : (
          <>
            <Download className="h-4 w-4" />
            <span>{t("exportButton")}</span>
          </>
        )}
      </Button>
    </div>
  );
}
