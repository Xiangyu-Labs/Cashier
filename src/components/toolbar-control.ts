/**
 * Controls that share a row in a ledger toolbar — the select toggle, the filter
 * trigger and the batch actions — used to take their height from three
 * different places (h-8, h-7, h-9) and two label sizes, so the row read as
 * three unrelated groups. A toolbar row takes its control height, padding and
 * label size from here instead.
 *
 * The tier is one step below `Button`'s default so the row stays quiet next to
 * the period label and the total it sits between: at 14px/36px the filter
 * trigger outweighed both. Icons are deliberately not part of this: `Button`
 * already sizes every icon it wraps, and one size per view is the convention.
 */
export const TOOLBAR_CONTROL_CLASS = "h-8 gap-1.5 px-2.5 text-xs";

/** Square, icon-only form of the same control. */
export const TOOLBAR_ICON_BUTTON_CLASS = "h-8 w-8";
