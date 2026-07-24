"use client";
import { BarChart3, ListChecks, ReceiptText, Settings } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { LedgerTab } from "@/modules/workspace/tabs";

interface TabNavigationProps {
  activeTab: LedgerTab;
  onTabChange: (tab: LedgerTab) => void;
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

export function TabNavigation({ activeTab, onTabChange }: TabNavigationProps) {
  const t = useTranslations("LedgerPage");

  return (
    <TabsList className="grid h-auto w-full grid-cols-4 gap-1 rounded-lg border border-border bg-surface2 p-1 md:inline-grid md:w-auto md:min-w-[28rem]">
      {TAB_CONFIG.map(({ value, icon: Icon, labelKey }) => (
        <TabsTrigger
          key={value}
          value={value}
          onClick={() => onTabChange(value)}
          className={cn(
            "min-h-11 gap-1.5 rounded-md px-2 text-xs sm:text-sm",
            "data-[state=active]:bg-surface data-[state=active]:text-text",
            "data-[state=active]:shadow-none data-[state=active]:ring-1 data-[state=active]:ring-border",
            activeTab === value ? "text-text" : "text-muted-foreground"
          )}
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
          <span>{t(labelKey)}</span>
        </TabsTrigger>
      ))}
    </TabsList>
  );
}
