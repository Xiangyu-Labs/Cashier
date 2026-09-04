"use client";

import { RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { AmountText } from "@/modules/currency/ui/amount-text";
import type { AnomalyCode, ProcessingFailureCode } from "@/application/contracts";
import { toStableAnomalyCode, toStableFailureCode } from "@/application/contracts";
import type { SourceDocument, SourceDocumentLight } from "@/modules/source-document/contracts";
import { useDiagnosticMessages } from "./use-diagnostic-messages";

interface SourceDocumentDetailStatusPanelsProps {
  sourceDocument: SourceDocument | SourceDocumentLight | null;
  loadError: boolean;
  isLoading: boolean;
  isReloading: boolean;
  reloadError: boolean;
  hasVersionConflict: boolean;
  onClose: () => void;
  onReload: () => void;
}

/**
 * Loading/error skeletons plus the revision-conflict, diagnostic, and
 * retained-result banners shown above the document body.
 */
export function SourceDocumentDetailStatusPanels({
  sourceDocument,
  loadError,
  isLoading,
  isReloading,
  reloadError,
  hasVersionConflict,
  onClose,
  onReload,
}: SourceDocumentDetailStatusPanelsProps) {
  const t = useTranslations("SourceDocumentDetail");
  const tCommon = useTranslations("Common");
  const diagnosticMessages = useDiagnosticMessages();

  return (
    <>
      {loadError && !sourceDocument ? (
        <div className="flex min-h-64 flex-col items-center justify-center gap-3 text-center">
          <p className="text-sm font-medium text-text">{t("loadError")}</p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={isReloading}>
              {tCommon("close")}
            </Button>
            <Button onClick={onReload} disabled={isReloading}>
              <RefreshCw className={cn("size-4", isReloading && "animate-spin")} />
              {tCommon("retry")}
            </Button>
          </div>
        </div>
      ) : null}
      {isLoading && !sourceDocument && (
        <div className="space-y-3 animate-pulse">
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded bg-border" />
            <div className="h-3 w-24 bg-border rounded" />
          </div>
          <div className="rounded-xl border border-border p-3 space-y-2">
            <div className="h-3 w-16 bg-border rounded" />
            <div className="h-6 w-28 bg-border rounded" />
          </div>
          <div className="space-y-2">
            {[1, 2].map((i) => (
              <div
                key={i}
                className="flex items-center gap-3 p-2.5 rounded-lg border border-border"
              >
                <div className="h-8 w-8 rounded-full bg-border" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3.5 w-28 bg-border rounded" />
                  <div className="h-2.5 w-16 bg-border rounded" />
                </div>
                <div className="h-3.5 w-14 bg-border rounded" />
              </div>
            ))}
          </div>
        </div>
      )}

      {sourceDocument && (
        <>
          {hasVersionConflict ? (
            <div
              className="mb-3 rounded-lg border border-warning/40 bg-warning/10 p-3"
              role="alert"
            >
              <p className="text-sm font-medium text-text">{t("revisionConflict")}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("revisionConflictDescription")}
              </p>
              {reloadError ? (
                <p className="mt-2 text-xs text-destructive">{t("reloadFailed")}</p>
              ) : null}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={onReload}
                disabled={isReloading}
              >
                <RefreshCw className={cn("size-4", isReloading && "animate-spin")} />
                {t("reloadServerData")}
              </Button>
            </div>
          ) : null}
          {/* Diagnostic code display for anomaly/failed states */}
          {(sourceDocument.status === "anomaly" || sourceDocument.status === "failed") && (
            <div className="mb-3 px-1">
              {(() => {
                const stableCode: AnomalyCode | ProcessingFailureCode =
                  sourceDocument.status === "anomaly"
                    ? toStableAnomalyCode(sourceDocument.anomalyReason)
                    : toStableFailureCode((sourceDocument as SourceDocument).errorCode);
                return (
                  <div className="flex items-start gap-2 p-2.5 rounded-lg bg-danger/5 border border-danger/10">
                    <span className="mt-1 size-2 shrink-0 rounded-full bg-danger" aria-hidden />
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs font-medium text-danger">
                        {diagnosticMessages.label(stableCode)}
                      </span>
                      <span className="text-[11px] text-muted-foreground/70">
                        {diagnosticMessages.description(stableCode)}
                      </span>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
          {/* Retained active result notice */}
          {(sourceDocument.status === "anomaly" || sourceDocument.status === "failed") &&
            sourceDocument.activeResultSummary != null && (
              <div className="mb-3 px-1">
                <div className="flex items-start gap-2 p-2.5 rounded-lg bg-primary/5 border border-primary/10">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs font-medium text-primary">
                      {t("activeResultTitle")}
                    </span>
                    <span className="text-[11px] text-muted-foreground/70">
                      {t("activeResultDescription")}
                    </span>
                    <AmountText variant="group">
                      {sourceDocument.activeResultSummary.entryCount} ·{" "}
                      {sourceDocument.activeResultSummary.total}
                    </AmountText>
                  </div>
                </div>
              </div>
            )}
        </>
      )}
    </>
  );
}
