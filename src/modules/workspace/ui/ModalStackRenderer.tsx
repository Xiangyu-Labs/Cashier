import { useState } from "react";
import { useModalStackStore } from "@/lib/store/modal-stack";
import { LedgerEntryDetailWrapper } from "@/modules/ledger/ui/LedgerEntryDetailWrapper";
import { SourceDocumentDetailWrapper } from "@/modules/source-document/ui/SourceDocumentDetailWrapper";
import type { EntryCategory } from "@/modules/ledger/contracts";
import { closeLedgerDetail } from "@/lib/navigation/ledger-detail-navigation";
import { useUnsavedChangesStore } from "@/lib/store/unsaved-changes";

interface ModalStackRendererProps {
  categories: EntryCategory[];
  mainCurrency: string;
  preferredCurrencies: string[];
}

export function ModalStackRenderer({
  categories,
  mainCurrency,
  preferredCurrencies,
}: ModalStackRendererProps) {
  const stack = useModalStackStore((state) => state.stack);
  const item = stack.at(-1);
  const itemKey = item == null ? null : `${item.type}:${item.ledgerId}:${item.id}`;
  const [closingKey, setClosingKey] = useState<string | null>(null);

  if (item == null) return null;
  const open = closingKey !== itemKey;
  const startExit = () => {
    setClosingKey(itemKey);
  };
  const requestBack = () => {
    const guardKey =
      item.type === "source-document"
        ? "source-document-detail:" + item.ledgerId + ":" + item.id
        : "ledger-entry-detail:" + item.ledgerId + ":" + item.id;
    const guard = useUnsavedChangesStore.getState().getLeaveGuard(guardKey);
    if (guard == null) startExit();
    else guard.requestLeave(startExit);
  };
  const onExitComplete = () => {
    const current = useModalStackStore.getState().stack.at(-1);
    if (current == null || `${current.type}:${current.ledgerId}:${current.id}` !== itemKey) {
      setClosingKey(null);
      return;
    }
    closeLedgerDetail();
    if (stack.length === 1) {
      const trigger = item.returnFocus;
      window.requestAnimationFrame(() => {
        if (trigger?.isConnected === true) trigger.focus();
        else {
          document.querySelector<HTMLElement>("[data-ledger-focus-fallback]")?.focus();
        }
      });
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
      ...(isTop && stack.length > 1 ? { onBack: requestBack } : {}),
      categories,
      mainCurrency,
      preferredCurrencies,
    };

    return stackItem.type === "source-document" ? (
      <SourceDocumentDetailWrapper key={key} {...sharedProps} />
    ) : (
      <LedgerEntryDetailWrapper key={key} {...sharedProps} />
    );
  });
}
