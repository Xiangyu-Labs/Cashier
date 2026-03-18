import { useModalStackStore } from "@/lib/store/modal-stack";
import { SourceDocumentDetailWrapper } from "@/features/source-document/components";
import { LedgerEntryDetailWrapper } from "@/features/ledger/components";
import type { EntryCategory } from "@/types/api";

interface ModalStackRendererProps {
  categories: EntryCategory[];
}

export function ModalStackRenderer({ categories }: ModalStackRendererProps) {
  const stack = useModalStackStore((state) => state.stack);
  const pop = useModalStackStore((state) => state.pop);
  // const isOpen = useModalStackStore(state => state.isOpen); // Not needed yet

  return (
    <>
      {/* 
               We render the stack. 
               Note: To support true stacking visual (one over another), we just render them all.
               Radix UI Dialog handles z-index stacking automatically for nested dialogs usually, 
               but since these are siblings in the DOM, we rely on order. 
               The last one in the array is on top.
            */}
      {stack.map((item, index) => {
        const isLast = index === stack.length - 1;
        const onClose = () => {
          // Only close if it's the top one?
          // Or find index and slice?
          // Usually users close top-most.
          // If we close a middle one, it's tricky.
          // For now assuming modal onClose triggers pop() which removes top.
          // But if a user manages to close a middle one (programmatically), we need to handle identity.

          // Actually, typical behaviour: close button calls pop().
          // But what if we want to support closing via ID?
          // For simplicity:
          if (isLast) pop();
        };

        if (item.type === "source-document") {
          return (
            <SourceDocumentDetailWrapper
              key={`source-doc-${item.id}`}
              id={item.id}
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
              open={true}
              onClose={onClose}
              categories={categories}
            />
          );
        }

        return null;
      })}
    </>
  );
}
