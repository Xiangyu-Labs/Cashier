export function ledgerDetailLeaveGuardKey(
  type: "source-document" | "ledger-entry",
  ledgerId: string,
  id: string
): string {
  return `${type}-detail:${ledgerId}:${id}`;
}
