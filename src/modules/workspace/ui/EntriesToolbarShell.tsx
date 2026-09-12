import type { MouseEvent, ReactNode } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { AmountText } from "@/modules/currency/ui/amount-text";

/**
 * Controls that own their own gesture: the select button, the filter panel and
 * anything either of them opens. Radix renders popovers in a portal, but React
 * still bubbles their events through this box, so an open panel has to opt out
 * by role as well.
 */
const OWN_GESTURE_SELECTOR = [
  "button",
  "a",
  "input",
  "select",
  "textarea",
  "[contenteditable='true']",
  "[role='button']",
  "[role='checkbox']",
  "[role='combobox']",
  "[role='dialog']",
  "[role='listbox']",
  "[role='menu']",
  "[role='menuitem']",
  "[role='option']",
  "[role='textbox']",
].join(", ");

interface EntriesToolbarShellProps {
  children: ReactNode;
  totalLabel?: string | undefined;
  batchActions?: ReactNode | undefined;
  syncStatus?: ReactNode | undefined;
  actions?: ReactNode | undefined;
  className?: string;
  /** Manual refresh for the tab. The box doubles as its trigger, so the bar
   * above the tabs carries no button wherever this is passed. */
  onRefresh?: (() => Promise<unknown> | unknown) | undefined;
  isRefreshing?: boolean | undefined;
}

export function EntriesToolbarShell({
  children,
  totalLabel,
  batchActions,
  syncStatus,
  actions,
  className = "",
  onRefresh,
  isRefreshing = false,
}: EntriesToolbarShellProps) {
  const t = useTranslations("Common");
  const refresh = async () => {
    if (onRefresh == null || isRefreshing) return;
    try {
      await onRefresh();
    } catch {
      toast.error(t("refreshFailed"));
    }
  };
  const handleDoubleClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target instanceof Element && event.target.closest(OWN_GESTURE_SELECTOR) != null) {
      return;
    }
    void refresh();
  };

  return (
    <div
      data-testid="entries-toolbar"
      className={`relative mx-2 mb-2 flex min-w-0 flex-wrap items-center gap-2 rounded-lg border border-border bg-surface p-2 sm:mb-4 ${className}`}
      {...(onRefresh != null ? { onDoubleClick: handleDoubleClick } : {})}
    >
      {children}
      {syncStatus != null ? (
        <div
          className="order-last min-w-0 basis-full text-xs text-muted-foreground sm:order-none sm:basis-auto"
          data-testid="toolbar-sync-status"
        >
          {syncStatus}
        </div>
      ) : null}
      {onRefresh != null ? (
        // Doubling as the trigger keeps the refresh reachable by keyboard and
        // by tap, which a double-click alone is not. Centred on the box rather
        // than between the controls, because it names a gesture the whole box
        // answers to; nothing in the row grows, so the middle is always free.
        <button
          type="button"
          data-testid="toolbar-refresh-hint"
          onClick={() => void refresh()}
          disabled={isRefreshing}
          title={t("refresh")}
          className="absolute left-1/2 top-1/2 shrink-0 -translate-x-1/2 -translate-y-1/2 select-none rounded-sm px-0.5 text-[11px] text-muted-foreground/40 transition-colors hover:text-muted-foreground/70"
        >
          {isRefreshing ? t("refreshing") : t("refreshHint")}
        </button>
      ) : null}
      {totalLabel != null && totalLabel !== "" ? (
        <AmountText variant="summary" className="ml-auto whitespace-nowrap">
          {totalLabel}
        </AmountText>
      ) : null}
      {actions != null ? (
        <div className={totalLabel == null ? "ml-auto" : undefined}>{actions}</div>
      ) : null}
      {batchActions != null ? <div className="min-w-0 basis-full">{batchActions}</div> : null}
    </div>
  );
}
