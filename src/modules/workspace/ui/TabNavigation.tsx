"use client";
import { BarChart3, ListChecks, Plus, ReceiptText, Settings } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { LedgerTab } from "@/modules/workspace/tabs";

interface TabNavigationProps {
  activeTab: LedgerTab;
  onTabChange: (tab: LedgerTab) => void;
  onOpenInput: () => void;
  onInputIntent?: () => void;
  /** Called when an inactive destination receives pointer or keyboard intent. */
  onTabIntent?: (tab: LedgerTab) => void;
  offline?: boolean;
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
  onInputIntent,
  onTabIntent,
  offline = false,
}: TabNavigationProps) {
  const t = useTranslations("LedgerPage");

  return (
    <nav
      aria-label={t("navigation")}
      className="grid h-full w-full grid-cols-[minmax(0,1fr)_minmax(0,1fr)_3.5rem_minmax(0,1fr)_minmax(0,1fr)] items-stretch"
    >
      {TAB_CONFIG.slice(0, 2).map(({ value, icon: Icon, labelKey }) => (
        <NavButton
          key={value}
          active={activeTab === value}
          icon={Icon}
          label={t(labelKey)}
          onClick={() => onTabChange(value)}
          disabled={false}
          onIntent={
            onTabIntent != null && value !== activeTab ? () => onTabIntent(value) : undefined
          }
        />
      ))}

      <button
        type="button"
        onClick={onOpenInput}
        disabled={offline}
        title={offline ? "需要联网" : undefined}
        onPointerEnter={onInputIntent}
        onPointerDown={onInputIntent}
        onFocus={onInputIntent}
        className="m-auto inline-flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface active:scale-[0.98]"
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
          disabled={offline && value === "settings"}
          onIntent={
            onTabIntent != null && value !== activeTab ? () => onTabIntent(value) : undefined
          }
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
  disabled?: boolean;
}

function NavButton({ active, icon: Icon, label, onClick, onIntent, disabled }: NavButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={disabled ? "需要联网" : undefined}
      onPointerEnter={onIntent}
      onPointerDown={onIntent}
      onFocus={onIntent}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative inline-flex h-full min-w-0 flex-col items-center justify-center gap-0.5 px-1 text-[11px] font-medium transition-colors after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:bg-transparent md:flex-row md:gap-1 md:px-2 md:text-sm",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
        disabled
          ? "cursor-not-allowed text-muted-foreground/45"
          : active
            ? "bg-surface2/60 text-text after:bg-primary"
            : "text-muted-foreground hover:bg-surface2/40 hover:text-text"
      )}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="truncate">{label}</span>
    </button>
  );
}
