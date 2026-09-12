export function ledgerDetailLeaveGuardKey(
  type: "source-document",
  ledgerId: string,
  id: string
): string {
  return `${type}-detail:${ledgerId}:${id}`;
}
