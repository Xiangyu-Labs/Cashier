import type { LedgerTab } from "@/lib/ledger-tabs";

export const LEDGER_TAB_ORDER: LedgerTab[] = ["stream", "details", "stats", "settings"];
export const SWIPE_DISTANCE_THRESHOLD = 72;
export const SWIPE_VELOCITY_THRESHOLD = 0.5;

export function resolveSwipeDestination(
  tab: LedgerTab,
  deltaX: number,
  velocityX: number
): LedgerTab | null {
  if (Math.abs(deltaX) < SWIPE_DISTANCE_THRESHOLD && Math.abs(velocityX) < SWIPE_VELOCITY_THRESHOLD)
    return null;
  const direction = deltaX < 0 ? 1 : -1;
  return LEDGER_TAB_ORDER[LEDGER_TAB_ORDER.indexOf(tab) + direction] ?? null;
}

export function shouldIgnoreTabSwipe(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return true;
  return (
    target.closest(
      "input,textarea,select,button,[role='dialog'],[data-tab-swipe-ignore],[data-dnd-kit-draggable-handle]"
    ) != null
  );
}
