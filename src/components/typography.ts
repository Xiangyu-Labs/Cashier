import { cn } from "@/lib/utils";

/**
 * The app's text roles.
 *
 * Before this table every surface picked its own size: page headings came in
 * four combinations of 20/24px and bold/semibold, section titles in three
 * sizes, and metadata in six different opacities. One role per purpose keeps
 * the same kind of text the same size everywhere.
 *
 * Amounts keep their own table in `@/modules/currency/ui/amount-text`; this one
 * covers the surrounding prose. Sizes come from the frozen scale in
 * `globals.css`; there is deliberately no role for the 20px `text-xl` tier.
 */
export type TextRole =
  | "pageTitle"
  | "dialogTitle"
  | "sectionTitle"
  | "cardTitle"
  | "body"
  | "bodyStrong"
  | "bodyMuted"
  | "meta"
  | "micro"
  | "provisional";

const textRoleClasses: Record<TextRole, string> = {
  /** The `<h1>` of a page. */
  pageTitle: "text-2xl font-semibold text-text",
  /** A modal or sheet title — one step above an in-page section. */
  dialogTitle: "text-lg font-semibold text-text",
  /** A page-level section heading, like a settings group. */
  sectionTitle: "text-base font-semibold text-text",
  /** The title of one card in a list, one step below a section heading. */
  cardTitle: "text-sm font-semibold text-text",
  body: "text-sm text-text",
  /** Emphasised prose: form labels, entry names, inline values. */
  bodyStrong: "text-sm font-medium text-text",
  /** Supporting prose: descriptions and hints that sit under a title. */
  bodyMuted: "text-sm text-muted-foreground",
  /** Secondary metadata: timestamps, counts, hints. */
  meta: "text-xs text-muted-foreground",
  /** The smallest tier: chips, chart ticks, dense badges. */
  micro: "text-micro text-muted-foreground",
  /** Machine-generated text that may still change — AI titles, extracted detail. */
  provisional: "text-micro italic text-muted-foreground/60",
};

export function textRoleClassName(role: TextRole, className?: string) {
  return cn(textRoleClasses[role], className);
}
