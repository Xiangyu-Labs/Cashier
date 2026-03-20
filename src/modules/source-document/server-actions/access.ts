import { AppError, UnauthorizedError } from "@/lib/errors";
import { requireLedgerAccess } from "@/modules/auth/access";

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
    let access: SourceDocumentLedgerAccess;

    try {
      access = await requireLedgerAccess(ledgerId);
    } catch (error) {
      if (error instanceof AppError) {
        throw new UnauthorizedError("Unauthorized or Ledger not found");
      }
      throw error;
    }

    return action({ ledgerId, ...access }, ...args);
  };
}
