export type ResolveHomeResult =
  | { kind: "redirect-existing"; ledgerId: string }
  | { kind: "redirect-created"; ledgerId: string }
  | { kind: "error"; message: string };
