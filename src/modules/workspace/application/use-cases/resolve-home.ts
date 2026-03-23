import { ensureUserLedger } from "./ensure-user-ledger";

type ResolveHomeResult =
  | { kind: "redirect-created"; ledgerId: string }
  | { kind: "redirect-existing"; ledgerId: string };

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
