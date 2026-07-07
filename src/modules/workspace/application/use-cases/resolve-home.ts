import { resolveSingleLedgerForUser } from "./ensure-user-ledger";

export interface ResolveHomeResult {
  ledgerId: string;
  created: boolean;
}

export async function resolveHome(input: {
  userId: string;
  locale: string;
}): Promise<ResolveHomeResult> {
  return resolveSingleLedgerForUser({
    userId: input.userId,
    locale: input.locale,
  });
}
