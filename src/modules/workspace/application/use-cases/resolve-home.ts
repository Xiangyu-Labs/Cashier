import type { ResolveHomeResult } from "../../contracts";
import { ensureUserLedger } from "./ensure-user-ledger";

export async function resolveHome(input: {
  userId: string;
  locale: string;
}): Promise<ResolveHomeResult> {
  const ensuredLedger = await ensureUserLedger({
    userId: input.userId,
    locale: input.locale,
  });

  return {
    kind: ensuredLedger.created ? "redirect-created" : "redirect-existing",
    ledgerId: ensuredLedger.ledgerId,
  };
}
