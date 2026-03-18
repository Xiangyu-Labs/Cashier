import type { DehydratedState } from "@tanstack/react-query";

export type ResolveHomeResult =
  | { kind: "redirect-existing"; ledgerId: string }
  | { kind: "redirect-created"; ledgerId: string }
  | { kind: "error"; message: string };

export interface LedgerPageBootstrapDto {
  dehydratedState: DehydratedState;
  initialStatsDate: Date;
}
