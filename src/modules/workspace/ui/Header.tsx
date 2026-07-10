"use client";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";

interface HeaderProps {
  onOpenInput: () => void;
}

export function Header({ onOpenInput }: HeaderProps) {
  const t = useTranslations("LedgerPage");

  return (
    <header className="sticky top-0 z-header border-b border-border bg-surface/90 backdrop-blur-md supports-[backdrop-filter]:bg-surface/80">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-3 sm:px-4 md:px-6">
        <span className="text-sm font-semibold text-text">Cashier</span>
        <Button
          size="sm"
          onClick={onOpenInput}
          className="h-9 w-9 rounded-md p-0"
          aria-label={t("newRecord")}
        >
          <Plus className="h-5 w-5" />
        </Button>
      </div>
    </header>
  );
}
