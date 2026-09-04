import { cache } from "react";
import { resolveSingleLedgerForUser } from "./ensure-user-ledger";
import type { LedgerPort } from "@/application/contracts";
import type { LedgerContract } from "@/application/contracts";

export interface ResolveHomeResult {
  ledger: LedgerContract;
  created: boolean;
}

const resolveHomeImpl = cache(
  async (
    input: { userId: string; locale: string },
    ledgers: Pick<LedgerPort, "listForUser" | "createDefault">
  ): Promise<ResolveHomeResult> => {
    return resolveSingleLedgerForUser(input, ledgers);
  }
);

export async function resolveHome(
  input: { userId: string; locale: string },
  ledgers: Pick<LedgerPort, "listForUser" | "createDefault">
): Promise<ResolveHomeResult> {
  return resolveHomeImpl(input, ledgers);
}
