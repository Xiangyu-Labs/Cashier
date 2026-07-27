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
  // const isOpen = useModalStackStore(state => state.isOpen); // Not needed yet

  const item = stack.at(-1);
  if (item == null) return null;
  const onClose = () => pop();

  if (item.type === "source-document") {
    return (
      <SourceDocumentDetailWrapper
        key={`source-doc-${item.id}`}
        id={item.id}
        ledgerId={item.ledgerId}
        open={true} // It's in the stack, so it's open
        onClose={onClose}
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
        open={true}
        onClose={onClose}
        categories={categories}
      />
    );
  }

  return null;
}
