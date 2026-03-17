/**
 * Collapsible Section Component
 *
 * A reusable collapsible section wrapper for settings panels.
 */

"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

interface CollapsibleSectionProps {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

export function CollapsibleSection({
  title,
  defaultOpen = false,
  children,
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <section className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-xl)] overflow-hidden">
        <CollapsibleTrigger asChild>
          <button
            className="w-full p-4 sm:p-6 flex items-center justify-between text-left hover:bg-[var(--surface2)]/50 transition-colors"
            type="button"
          >
            <h2 className="text-lg font-medium">{title}</h2>
            <ChevronDown
              className={cn(
                "h-5 w-5 text-muted-foreground transition-transform duration-200",
                isOpen && "rotate-180"
              )}
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-4 sm:px-6 pb-4 sm:pb-6 pt-0 space-y-6 border-t border-[var(--border)]">
            {children}
          </div>
        </CollapsibleContent>
      </section>
    </Collapsible>
  );
}
