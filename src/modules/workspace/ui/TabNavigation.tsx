"use client";
import { BarChart3, ListChecks, Plus, ReceiptText, Settings } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { LedgerTab } from "@/modules/workspace/tabs";

interface TabNavigationProps {
  activeTab: LedgerTab;
  onTabChange: (tab: LedgerTab) => void;
  onOpenInput: () => void;
  /** Called when an inactive destination receives pointer or keyboard intent. */
  onTabIntent?: (tab: LedgerTab) => void;
}

const TAB_CONFIG: Array<{
  value: LedgerTab;
  icon: typeof ReceiptText;
  labelKey: LedgerTab;
}> = [
  { value: "stream", icon: ReceiptText, labelKey: "stream" },
  { value: "details", icon: ListChecks, labelKey: "details" },
  { value: "stats", icon: BarChart3, labelKey: "stats" },
  { value: "settings", icon: Settings, labelKey: "settings" },
];

export function TabNavigation({
  activeTab,
  onTabChange,
  onOpenInput,
  onTabIntent,
}: TabNavigationProps) {
  const t = useTranslations("LedgerPage");

  return (
    <nav
      aria-label={t("navigation")}
      className="grid w-full max-w-xl grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2.75rem_minmax(0,1fr)_minmax(0,1fr)] items-center gap-1 rounded-lg border border-border bg-surface2 p-1"
    >
      {TAB_CONFIG.slice(0, 2).map(({ value, icon: Icon, labelKey }) => (
        <NavButton
          key={value}
          active={activeTab === value}
          icon={Icon}
          label={t(labelKey)}
          onClick={() => onTabChange(value)}
          onIntent={onTabIntent != null && value !== activeTab ? () => onTabIntent(value) : undefined}
        />
      ))}

      <button
        type="button"
        onClick={onOpenInput}
        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface2 active:scale-[0.98]"
        aria-label={t("newRecord")}
      >
        <Plus className="h-5 w-5" aria-hidden="true" />
      </button>

      {TAB_CONFIG.slice(2).map(({ value, icon: Icon, labelKey }) => (
        <NavButton
          key={value}
          active={activeTab === value}
          icon={Icon}
          label={t(labelKey)}
          onClick={() => onTabChange(value)}
          onIntent={onTabIntent != null && value !== activeTab ? () => onTabIntent(value) : undefined}
        />
      ))}
    </nav>
  );
}

interface NavButtonProps {
  active: boolean;
  icon: typeof ReceiptText;
  label: string;
  onClick: () => void;
  onIntent?: (() => void) | undefined;
}

function NavButton({ active, icon: Icon, label, onClick, onIntent }: NavButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      onPointerEnter={onIntent}
      onFocus={onIntent}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-md px-1.5 text-xs font-medium transition-colors sm:px-2 sm:text-sm",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface2",
        active
          ? "bg-surface text-text shadow-sm ring-1 ring-border"
          : "text-muted-foreground hover:bg-surface/60 hover:text-text"
      )}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="truncate">{label}</span>
    </button>
  );
}
