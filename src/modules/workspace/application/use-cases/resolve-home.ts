import { cache } from "react";
import { resolveSingleLedgerForUser } from "./ensure-user-ledger";

export interface ResolveHomeResult {
  ledgerId: string;
  created: boolean;
}

const resolveHomeImpl = cache(
  async (input: { userId: string; locale: string }): Promise<ResolveHomeResult> => {
    return resolveSingleLedgerForUser(input);
  }
);

export async function resolveHome(input: {
  userId: string;
  locale: string;
}): Promise<ResolveHomeResult> {
  return resolveHomeImpl(input);
}
