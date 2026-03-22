import { requireLedgerAccess } from "@/modules/ledger/access";

type SourceDocumentLedgerAccess = Awaited<ReturnType<typeof requireLedgerAccess>>;

export interface SourceDocumentLedgerActionContext extends SourceDocumentLedgerAccess {
  ledgerId: string;
}

export function withSourceDocumentLedgerAccess<TArgs extends unknown[], TReturn>(
  action: (
    context: SourceDocumentLedgerActionContext,
    ...args: TArgs
  ) => Promise<TReturn>
): (ledgerId: string, ...args: TArgs) => Promise<TReturn> {
  return async (ledgerId: string, ...args: TArgs) => {
    const access = await requireLedgerAccess(ledgerId);

    return action({ ledgerId, ...access }, ...args);
  };
}
