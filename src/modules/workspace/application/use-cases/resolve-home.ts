import { cache } from "react";
import { resolveSingleLedgerForUser } from "./ensure-user-ledger";
import type { LedgerPort } from "@/application/contracts";

export interface ResolveHomeResult {
  ledgerId: string;
  created: boolean;
}

const resolveHomeImpl = cache(
  async (
    input: { userId: string; locale: string },
    ledgers: Pick<LedgerPort, "listIdsForUser" | "createDefault">
  ): Promise<ResolveHomeResult> => {
    return resolveSingleLedgerForUser(input, ledgers);
  }
);

export async function resolveHome(
  input: { userId: string; locale: string },
  ledgers: Pick<LedgerPort, "listIdsForUser" | "createDefault">
): Promise<ResolveHomeResult> {
  return resolveHomeImpl(input, ledgers);
}
