import { useState } from "react";
import { useModalStackStore } from "@/lib/store/modal-stack";
import { LedgerEntryDetailWrapper } from "@/modules/ledger/ui";
import { SourceDocumentDetailWrapper } from "@/modules/source-document/ui";
import type { EntryCategory } from "@/modules/ledger/contracts";

interface ModalStackRendererProps {
  categories: EntryCategory[];
}

export function ModalStackRenderer({ categories }: ModalStackRendererProps) {
  const stack = useModalStackStore((state) => state.stack);
  const pop = useModalStackStore((state) => state.pop);
  const item = stack.at(-1);
  const itemKey = item == null ? null : `${item.type}:${item.id}`;
  const [closingKey, setClosingKey] = useState<string | null>(null);

  if (item == null) return null;
  const open = closingKey !== itemKey;
  const onClose = () => setClosingKey(itemKey);
  const onExitComplete = () => {
    const current = useModalStackStore.getState().stack.at(-1);
    if (current != null && `${current.type}:${current.id}` === itemKey) pop();
  };

  if (item.type === "source-document") {
    return (
      <SourceDocumentDetailWrapper
        key={`source-doc-${item.id}`}
        id={item.id}
        ledgerId={item.ledgerId}
        open={open}
        onClose={onClose}
        onExitComplete={onExitComplete}
        categories={categories}
      />
    );
  }

  if (item.type === "ledger-entry") {
    return (
      <LedgerEntryDetailWrapper
        key={`ledger-entry-${item.id}`}
        id={item.id}
        ledgerId={item.ledgerId}
        open={open}
        onClose={onClose}
        onExitComplete={onExitComplete}
        categories={categories}
      />
    );
  }

  return null;
}
