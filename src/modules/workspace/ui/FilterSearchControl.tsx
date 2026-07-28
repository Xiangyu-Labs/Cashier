"use client";

import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { normalizeSearchTerm } from "@/lib/search";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

interface FilterSearchControlProps {
  value?: string | null | undefined;
  onChange: (value: string | null) => void;
  className?: string;
}

export function FilterSearchControl({ value, onChange, className }: FilterSearchControlProps) {
  const t = useTranslations("EntryFilterPanel");
  const [expanded, setExpanded] = useState(Boolean(value));
  const [draft, setDraft] = useState(value ?? "");
  const [previousValue, setPreviousValue] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  if (value !== previousValue) {
    setPreviousValue(value);
    if ((normalizeSearchTerm(draft) ?? null) !== (value ?? null)) {
      setDraft(value ?? "");
    }
  }

  useEffect(() => {
    const normalized = normalizeSearchTerm(draft) ?? null;
    if (normalized === (value ?? null)) return;
    const timer = window.setTimeout(() => onChange(normalized), 300);
    return () => window.clearTimeout(timer);
  }, [draft, onChange, value]);

  useEffect(() => {
    if (expanded) inputRef.current?.focus();
  }, [expanded]);

  const clear = () => {
    setDraft("");
    onChange(null);
    inputRef.current?.focus();
  };

  return (
    <div
      className={cn(
        "relative order-last basis-full sm:order-none sm:basis-auto",
        !expanded && "max-sm:w-auto max-sm:basis-auto",
        className
      )}
    >
      {!expanded ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 sm:hidden"
          aria-label={t("search")}
          onClick={() => setExpanded(true)}
        >
          <Search className="h-4 w-4" />
        </Button>
      ) : null}
      <div className={cn("relative w-full sm:block sm:w-56", !expanded && "hidden")}>
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={inputRef}
          type="search"
          value={draft}
          maxLength={100}
          onChange={(event) => {
            const next = event.target.value;
            setDraft(next);
            if (next === "") onChange(null);
          }}
          placeholder={t("searchPlaceholder")}
          aria-label={t("search")}
          className="h-8 w-full pl-8 pr-8 text-sm"
        />
        {draft !== "" ? (
          <button
            type="button"
            onClick={clear}
            className="absolute right-1 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground hover:text-text"
            aria-label={t("clearSearch")}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="absolute right-1 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground sm:hidden"
            aria-label={t("closeSearch")}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
