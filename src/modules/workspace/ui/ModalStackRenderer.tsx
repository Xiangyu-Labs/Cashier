import { useEffect, useRef, useState } from "react";
import { useModalStackStore } from "@/lib/store/modal-stack";
import { LedgerEntryDetailWrapper } from "@/modules/ledger/ui/LedgerEntryDetailWrapper";
import { SourceDocumentDetailWrapper } from "@/modules/source-document/ui";
import type { EntryCategory } from "@/modules/ledger/contracts";
import { closeLedgerDetail } from "../ledger-detail-navigation";

interface ModalStackRendererProps {
  categories: EntryCategory[];
}

export function ModalStackRenderer({ categories }: ModalStackRendererProps) {
  const stack = useModalStackStore((state) => state.stack);
  const item = stack.at(-1);
  const itemKey = item == null ? null : `${item.type}:${item.ledgerId}:${item.id}`;
  const [closingKey, setClosingKey] = useState<string | null>(null);
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
  const startExit = () => {
    setClosingKey(itemKey);
  };
  const onExitComplete = () => {
    const current = useModalStackStore.getState().stack.at(-1);
    if (current == null || `${current.type}:${current.ledgerId}:${current.id}` !== itemKey) {
      setClosingKey(null);
      return;
    }
    closeLedgerDetail();
    if (stack.length === 1) {
      const trigger = initialTriggerRef.current;
      window.requestAnimationFrame(() => trigger?.focus());
      initialTriggerRef.current = null;
    }
    setClosingKey(null);
  };

  return stack.map((stackItem, index) => {
    const key = `${stackItem.type}:${stackItem.ledgerId}:${stackItem.id}`;
    const isTop = index === stack.length - 1;
    const sharedProps = {
      id: stackItem.id,
      ledgerId: stackItem.ledgerId,
      open: isTop && open,
      onClose: isTop ? startExit : () => {},
      ...(isTop && closingKey === key ? { onExitComplete } : {}),
      ...(isTop && stack.length > 1 ? { onBack: startExit } : {}),
      categories,
    };

    return stackItem.type === "source-document" ? (
      <SourceDocumentDetailWrapper key={key} {...sharedProps} />
    ) : (
      <LedgerEntryDetailWrapper key={key} {...sharedProps} />
    );
  });
}
