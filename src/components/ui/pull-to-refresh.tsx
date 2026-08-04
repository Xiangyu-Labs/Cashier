"use client";
import { useState, useRef, useEffect, useLayoutEffect, type ReactNode } from "react";
import { useTranslations } from "next-intl";

interface PullToRefreshProps {
  onRefresh: () => Promise<void>;
  children: ReactNode;
  threshold?: number;
  disabled?: boolean;
  className?: string;
  header?: ReactNode;
  indicator?: (state: {
    isRefreshing: boolean;
    pullDistance: number;
    releaseToRefresh: boolean;
  }) => ReactNode;
}

interface PullToRefreshController {
  root: HTMLElement;
  handleTouchStart: (event: TouchEvent) => void;
  handleTouchMove: (event: TouchEvent) => void;
  handleTouchEnd: (event: TouchEvent) => void;
  handleTouchCancel: (event: TouchEvent) => void;
}

const pullToRefreshControllers = new Set<PullToRefreshController>();

export function PullToRefresh({
  onRefresh,
  children,
  threshold = 60,
  disabled = false,
  className,
  header,
  indicator,
}: PullToRefreshProps) {
  const t = useTranslations("PullToRefresh");
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const startYRef = useRef(0);
  const startXRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLElement | null>(null);
  const lastRefreshTime = useRef(0);
  const isPullingRef = useRef(false);
  const isRefreshingRef = useRef(false);
  const pullDistanceRef = useRef(0);
  const mountedRef = useRef(true);
  // Keep the latest refresh callback available without re-registering touch listeners.
  const onRefreshRef = useRef(onRefresh);

  useLayoutEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

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
    // If disabled or non-touch device, don't add document listeners.
    if (disabled || !("ontouchstart" in window)) return;

    const container = containerRef.current;
    if (!container) return;

    const resetPullState = () => {
      isPullingRef.current = false;
      startYRef.current = 0;
      startXRef.current = 0;
      surfaceRef.current = null;
      pullDistanceRef.current = 0;
      if (mountedRef.current) setPullDistance(0);
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (isRefreshingRef.current) return;

      const target = toElement(e.target);
      const surface = findPullToRefreshSurface(target);
      if (surface == null || findActivePullToRefreshRoot(surface, target) !== container) return;
      if (isBlockedTarget(target) || getScrollTop(surface) !== 0) return;

      const firstTouch = e.touches[0];
      if (firstTouch == null) return;
      surfaceRef.current = surface;
      startYRef.current = firstTouch.clientY;
      startXRef.current = firstTouch.clientX;
      pullDistanceRef.current = 0;
      isPullingRef.current = true;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isPullingRef.current || isRefreshingRef.current) return;

      const firstTouch = e.touches[0];
      if (firstTouch == null) return;

      const currentY = firstTouch.clientY;
      const distanceY = currentY - startYRef.current;
      const distanceX = firstTouch.clientX - startXRef.current;
      const surface = surfaceRef.current;

      if (surface == null || getScrollTop(surface) !== 0) {
        resetPullState();
        return;
      }

      // Let upward and horizontal gestures continue through the browser/tab
      // swipe handlers. The native overscroll is intercepted only after the
      // gesture is clearly a downward pull.
      if (distanceY <= 0 || distanceY <= Math.abs(distanceX)) {
        if (Math.abs(distanceY) > 8 || Math.abs(distanceX) > 8) resetPullState();
        return;
      }

      if (e.cancelable) e.preventDefault();

      // Apply the existing damping and max distance.
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

      // Trigger refresh if threshold exceeded
      if (currentPullDistance > threshold) {
        // Debounce: 500ms between refreshes
        const now = Date.now();
        if (now - lastRefreshTime.current < 500) {
          resetPullState();
          return;
        }

        lastRefreshTime.current = now;
        isRefreshingRef.current = true;
        setIsRefreshing(true);

        try {
          await onRefreshRef.current();
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
        // Not enough distance, bounce back
        resetPullState();
      }
    };

    const handleTouchCancel = () => {
      if (!isRefreshingRef.current) resetPullState();
    };

    // Register at document level so the entire marked main surface, including
    // its margins and short-list whitespace, can start a pull gesture. The
    // module keeps one shared set of document listeners for all instances.
    return registerPullToRefreshController({
      root: container,
      handleTouchStart,
      handleTouchMove,
      handleTouchEnd,
      handleTouchCancel,
    });
  }, [disabled, threshold]);

  if (disabled) {
    return (
      <div className={className}>
        {header}
        {children}
      </div>
    );
  }

  // 计算指示器状态
  const indicatorScale = isRefreshing || pullDistance > 30 ? 1 : pullDistance / 30;
  const showText = isRefreshing || pullDistance > 20;
  const releaseToRefresh = pullDistance > threshold;
  const isVisible = pullDistance > 0 || isRefreshing;

  return (
    <div ref={containerRef} data-pull-to-refresh-root="" className={className}>
      {/* Pull-down indicator — CSS transitions replace Framer Motion */}
      <div
        data-testid="pull-to-refresh-indicator"
        className="overflow-hidden transition-opacity duration-[var(--motion-state)] ease-[var(--motion-enter)]"
        style={{
          opacity: isVisible ? 1 : 0,
          height: isVisible ? (isRefreshing ? 44 : pullDistance) : 0,
        }}
      >
        <div className="flex flex-col items-center justify-end overflow-hidden" role="status">
          {indicator?.({ isRefreshing, pullDistance, releaseToRefresh }) ?? (
            <div className="flex items-center gap-2 pb-2">
              {/* Spinner indicator — CSS animation replaces motion.div */}
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

              {/* Text hint */}
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
          )}
        </div>
      </div>

      {header}
      {/* 子内容 */}
      {children}
    </div>
  );
}

function registerPullToRefreshController(controller: PullToRefreshController) {
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

function isBlockedTarget(target: Element | null): boolean {
  return (
    target?.closest(
      "nav, [role='dialog'], [data-no-pull-to-refresh], button, input, textarea, select, option, a, [contenteditable='true']"
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
