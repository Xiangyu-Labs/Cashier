import { useEffect, useRef, useState } from "react";
import { useModalStackStore } from "@/lib/store/modal-stack";
import { LedgerEntryDetailWrapper } from "@/modules/ledger/ui/LedgerEntryDetailWrapper";
import { SourceDocumentDetailWrapper } from "@/modules/source-document/ui";
import type { EntryCategory } from "@/modules/ledger/contracts";

interface ModalStackRendererProps {
  categories: EntryCategory[];
}

export function ModalStackRenderer({ categories }: ModalStackRendererProps) {
  const stack = useModalStackStore((state) => state.stack);
  const pop = useModalStackStore((state) => state.pop);
  const closeAll = useModalStackStore((state) => state.closeAll);
  const item = stack.at(-1);
  const itemKey = item == null ? null : `${item.type}:${item.ledgerId}:${item.id}`;
  const [closingKey, setClosingKey] = useState<string | null>(null);
  const closingActionRef = useRef<"back" | "close-all">("close-all");
  const initialTriggerRef = useRef<HTMLElement | null>(null);
  const previousLengthRef = useRef(0);

  useEffect(() => {
    if (previousLengthRef.current === 0 && stack.length > 0) {
      initialTriggerRef.current = document.activeElement as HTMLElement | null;
    }
    previousLengthRef.current = stack.length;
  }, [stack.length]);

  if (item == null) return null;
  const open = closingKey !== itemKey;
  const startExit = (action: "back" | "close-all") => {
    closingActionRef.current = action;
    setClosingKey(itemKey);
  };
  const onExitComplete = () => {
    const current = useModalStackStore.getState().stack.at(-1);
    if (current == null || `${current.type}:${current.ledgerId}:${current.id}` !== itemKey) {
      setClosingKey(null);
      return;
    }
    if (closingActionRef.current === "back") {
      pop();
    } else {
      closeAll();
      const trigger = initialTriggerRef.current;
      window.requestAnimationFrame(() => trigger?.focus());
      initialTriggerRef.current = null;
    }
    setClosingKey(null);
  };

  // Only the top of the stack is mounted. Lower stack items are kept as plain
  // ModalItem history and are re-mounted (and refetched through the
  // ledger-scoped React Query cache) when the top closes with "back".
  const sharedProps = {
    id: item.id,
    ledgerId: item.ledgerId,
    open,
    onClose: () => startExit("close-all"),
    onExitComplete,
    ...(stack.length > 1 ? { onBack: () => startExit("back") } : {}),
    categories,
  };

  return item.type === "source-document" ? (
    <SourceDocumentDetailWrapper key={itemKey} {...sharedProps} />
  ) : (
    <LedgerEntryDetailWrapper key={itemKey} {...sharedProps} />
  );
}
