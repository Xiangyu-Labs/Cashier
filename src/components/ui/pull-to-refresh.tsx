"use client";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import {
  usePullToRefreshContext,
  type PullToRefreshCallback,
} from "@/modules/workspace/pull-to-refresh-context";

interface PullToRefreshSurfaceController {
  root: HTMLElement;
  getRefresh: () => PullToRefreshCallback | null;
  handleTouchStart: (event: TouchEvent) => void;
  handleTouchMove: (event: TouchEvent) => void;
  handleTouchEnd: (event: TouchEvent) => void;
  handleTouchCancel: (event: TouchEvent) => void;
}

const pullToRefreshControllers = new Set<PullToRefreshSurfaceController>();

interface PullToRefreshSurfaceProps {
  children: ReactNode;
  className?: string;
}

/**
 * Single App-Shell-level pull-to-refresh surface.
 *
 * The AppShell owns exactly one of these. Tabs register their refresh
 * callbacks through `useRegisterPullToRefresh`; this component only renders
 * the indicator and the gesture handling for the marked `<main>` surface.
 *
 * Gesture rules:
 * - The whole marked main surface (including margins and short-list
 *   whitespace below a `min-h-full` root) can start a downward pull.
 * - Only a clearly downward gesture at scroll position 0 is intercepted.
 * - Inputs, editable elements, dialogs, nav and `[data-no-pull-to-refresh]`
 *   areas never start a pull. Buttons, heatmap cells, chart points and cards
 *   are intentionally allowed so tapping/dragging cards can refresh.
 */
export function PullToRefreshSurface({ children, className }: PullToRefreshSurfaceProps) {
  const t = useTranslations("PullToRefresh");
  const { getRefresh } = usePullToRefreshContext();
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const startYRef = useRef(0);
  const startXRef = useRef(0);
  const surfaceRef = useRef<HTMLElement | null>(null);
  const lastRefreshTime = useRef(0);
  const isPullingRef = useRef(false);
  const isRefreshingRef = useRef(false);
  const pullDistanceRef = useRef(0);
  const mountedRef = useRef(true);

  useLayoutEffect(() => {
    isRefreshingRef.current = isRefreshing;
  }, [isRefreshing]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    // Non-touch devices never register document listeners.
    if (!("ontouchstart" in window)) return;

    const root = rootRef.current;
    if (root == null) return;

    const resetPullState = () => {
      isPullingRef.current = false;
      startYRef.current = 0;
      startXRef.current = 0;
      surfaceRef.current = null;
      pullDistanceRef.current = 0;
      if (mountedRef.current) setPullDistance(0);
    };

    const handleTouchStart = (event: TouchEvent) => {
      if (isRefreshingRef.current) return;

      const target = toElement(event.target);
      const surface = findPullToRefreshSurface(target);
      if (surface == null || findActivePullToRefreshRoot(surface, target) !== root) return;
      if (isBlockedTarget(target) || getScrollTop(surface) !== 0) return;

      const firstTouch = event.touches[0];
      if (firstTouch == null) return;
      surfaceRef.current = surface;
      startYRef.current = firstTouch.clientY;
      startXRef.current = firstTouch.clientX;
      pullDistanceRef.current = 0;
      isPullingRef.current = true;
    };

    const handleTouchMove = (event: TouchEvent) => {
      if (!isPullingRef.current || isRefreshingRef.current) return;

      const firstTouch = event.touches[0];
      if (firstTouch == null) return;

      const distanceY = firstTouch.clientY - startYRef.current;
      const distanceX = firstTouch.clientX - startXRef.current;
      const surface = surfaceRef.current;

      if (surface == null || getScrollTop(surface) !== 0) {
        resetPullState();
        return;
      }

      // Direction lock: let upward and horizontal gestures pass through
      // untouched (tab swipe, heatmap horizontal scroll, browser overscroll).
      if (distanceY <= 0 || distanceY <= Math.abs(distanceX)) {
        if (Math.abs(distanceY) > 8 || Math.abs(distanceX) > 8) resetPullState();
        return;
      }

      if (event.cancelable) event.preventDefault();

      const maxDistance = 80;
      const damping = 0.5;
      const dampedDistance = Math.min(distanceY * damping, maxDistance);
      pullDistanceRef.current = dampedDistance;
      if (mountedRef.current) setPullDistance(dampedDistance);
    };

    const handleTouchEnd = async () => {
      if (!isPullingRef.current) return;

      isPullingRef.current = false;
      surfaceRef.current = null;
      const currentPullDistance = pullDistanceRef.current;

      if (currentPullDistance > 60) {
        const now = Date.now();
        if (now - lastRefreshTime.current < 500) {
          resetPullState();
          return;
        }

        lastRefreshTime.current = now;
        isRefreshingRef.current = true;
        setIsRefreshing(true);

        try {
          await getRefresh()?.();
        } catch (error) {
          console.error("Pull to refresh error:", error);
        } finally {
          isRefreshingRef.current = false;
          if (mountedRef.current) {
            setIsRefreshing(false);
            resetPullState();
          } else {
            pullDistanceRef.current = 0;
          }
        }
      } else {
        resetPullState();
      }
    };

    const handleTouchCancel = () => {
      if (!isRefreshingRef.current) resetPullState();
    };

    return registerPullToRefreshController({
      root,
      getRefresh,
      handleTouchStart,
      handleTouchMove,
      handleTouchEnd,
      handleTouchCancel,
    });
  }, [getRefresh]);

  const indicatorScale = isRefreshing || pullDistance > 30 ? 1 : pullDistance / 30;
  const showText = isRefreshing || pullDistance > 20;
  const releaseToRefresh = pullDistance > 60;
  const isVisible = pullDistance > 0 || isRefreshing;

  return (
    <div
      ref={rootRef}
      data-pull-to-refresh-root=""
      className={cn("flex min-h-full w-full min-w-0 flex-1 flex-col", className)}
    >
      <div
        data-testid="pull-to-refresh-indicator"
        className="overflow-hidden transition-opacity duration-[var(--motion-state)] ease-[var(--motion-enter)]"
        style={{
          opacity: isVisible ? 1 : 0,
          height: isVisible ? (isRefreshing ? 44 : pullDistance) : 0,
        }}
      >
        <div className="flex flex-col items-center justify-end overflow-hidden" role="status">
          <div className="flex items-center gap-2 pb-2">
            <div
              style={{
                transform: `scale(${indicatorScale})`,
                transition: "transform var(--motion-state) var(--motion-enter)",
              }}
            >
              <div
                className={`h-5 w-5 rounded-full border-2 border-primary/20 border-t-primary ${
                  isRefreshing ? "animate-spin" : ""
                }`}
              />
            </div>

            {showText && (
              <span className="transition-opacity duration-200 text-xs text-muted-foreground">
                {isRefreshing
                  ? t("refreshing")
                  : releaseToRefresh
                    ? t("releaseToRefresh")
                    : t("pullToRefresh")}
              </span>
            )}
          </div>
        </div>
      </div>
      {children}
    </div>
  );
}

function registerPullToRefreshController(controller: PullToRefreshSurfaceController) {
  const wasEmpty = pullToRefreshControllers.size === 0;
  pullToRefreshControllers.add(controller);
  if (wasEmpty) {
    document.addEventListener("touchstart", handleDocumentTouchStart, { passive: true });
    document.addEventListener("touchmove", handleDocumentTouchMove, { passive: false });
    document.addEventListener("touchend", handleDocumentTouchEnd, { passive: true });
    document.addEventListener("touchcancel", handleDocumentTouchCancel, { passive: true });
  }

  return () => {
    pullToRefreshControllers.delete(controller);
    if (pullToRefreshControllers.size !== 0) return;
    document.removeEventListener("touchstart", handleDocumentTouchStart);
    document.removeEventListener("touchmove", handleDocumentTouchMove);
    document.removeEventListener("touchend", handleDocumentTouchEnd);
    document.removeEventListener("touchcancel", handleDocumentTouchCancel);
  };
}

function handleDocumentTouchStart(event: TouchEvent) {
  const target = toElement(event.target);
  const surface = findPullToRefreshSurface(target);
  const activeRoot = surface == null ? null : findActivePullToRefreshRoot(surface, target);
  if (activeRoot == null) return;
  for (const controller of pullToRefreshControllers) {
    if (controller.root === activeRoot) {
      controller.handleTouchStart(event);
      return;
    }
  }
}

function handleDocumentTouchMove(event: TouchEvent) {
  for (const controller of pullToRefreshControllers) controller.handleTouchMove(event);
}

function handleDocumentTouchEnd(event: TouchEvent) {
  for (const controller of pullToRefreshControllers) void controller.handleTouchEnd(event);
}

function handleDocumentTouchCancel(event: TouchEvent) {
  for (const controller of pullToRefreshControllers) controller.handleTouchCancel(event);
}

function toElement(target: EventTarget | null): Element | null {
  if (target instanceof Element) return target;
  if (target instanceof Node) return target.parentElement;
  return null;
}

function findPullToRefreshSurface(target: Element | null): HTMLElement | null {
  return target?.closest<HTMLElement>("[data-pull-to-refresh-surface]") ?? null;
}

function findActivePullToRefreshRoot(
  surface: HTMLElement,
  target: Element | null
): HTMLElement | null {
  const targetRoot = target?.closest<HTMLElement>("[data-pull-to-refresh-root]");
  if (targetRoot != null && targetRoot.closest("[data-pull-to-refresh-surface]") === surface) {
    return isVisible(targetRoot) ? targetRoot : null;
  }

  const roots = surface.querySelectorAll<HTMLElement>("[data-pull-to-refresh-root]");
  for (const root of roots) {
    if (isVisible(root)) return root;
  }
  return null;
}

function isVisible(element: HTMLElement): boolean {
  let current: HTMLElement | null = element;
  while (current != null) {
    if (current.hidden || current.getAttribute("aria-hidden") === "true") return false;
    const style = window.getComputedStyle(current);
    if (style.display === "none" || style.visibility === "hidden") return false;
    current = current.parentElement;
  }
  return true;
}

/**
 * Only inputs, editable elements, dialogs, nav and explicitly marked regions
 * are blocked. Buttons, heatmap cells, chart points and card surfaces are
 * allowed to start a pull.
 */
function isBlockedTarget(target: Element | null): boolean {
  return (
    target?.closest(
      "nav, [role='dialog'], [data-no-pull-to-refresh], input, textarea, select, option, [contenteditable='true']"
    ) != null
  );
}

function getScrollTop(surface: HTMLElement): number {
  return Math.max(
    surface.scrollTop,
    window.scrollY ?? 0,
    document.documentElement.scrollTop,
    document.body.scrollTop
  );
}
