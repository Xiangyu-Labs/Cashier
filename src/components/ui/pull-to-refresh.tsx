"use client";
import { useState, useRef, useEffect, useLayoutEffect, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations } from "next-intl";

interface PullToRefreshProps {
  onRefresh: () => Promise<void>;
  children: ReactNode;
  threshold?: number;
  disabled?: boolean;
  className?: string;
}

export function PullToRefresh({
  onRefresh,
  children,
  threshold = 60,
  disabled = false,
  className,
}: PullToRefreshProps) {
  const t = useTranslations("PullToRefresh");
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const startYRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastRefreshTime = useRef(0);
  const isPullingRef = useRef(false);
  const pullDistanceRef = useRef(0);
  // Keep the latest refresh callback available without re-registering touch listeners.
  const onRefreshRef = useRef(onRefresh);

  // Detect touch device on mount
  useEffect(() => {
    setIsTouchDevice("ontouchstart" in window);
  }, []);

  useLayoutEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    // If disabled or non-touch device, don't add listeners
    if (disabled || !isTouchDevice) return;

    const container = containerRef.current;
    if (!container) return;

    const handleTouchStart = (e: TouchEvent) => {
      // Only allow pull when at top
      const scrollTop = container.scrollTop;
      const bodyScrollTop = window.scrollY ?? document.documentElement.scrollTop;

      if (scrollTop === 0 && bodyScrollTop === 0 && isRefreshing === false) {
        const firstTouch = e.touches[0];
        if (firstTouch == null) return;
        startYRef.current = firstTouch.clientY;
        isPullingRef.current = true;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isPullingRef.current || isRefreshing === true) return;

      const firstTouch = e.touches[0];
      if (firstTouch == null) return;

      const currentY = firstTouch.clientY;
      const distance = currentY - startYRef.current;
      const containerScrollTop = container.scrollTop;
      const bodyScrollTop = window.scrollY ?? document.documentElement.scrollTop;

      // Only when pulling down and at top
      if (distance > 0 && containerScrollTop === 0 && bodyScrollTop === 0) {
        if (e.cancelable) e.preventDefault();

        // Apply damping and max distance
        const maxDistance = 80;
        const damping = 0.5;
        const dampedDistance = Math.min(distance * damping, maxDistance);

        pullDistanceRef.current = dampedDistance;
        setPullDistance(dampedDistance);
      }
    };

    const handleTouchEnd = async () => {
      if (!isPullingRef.current) return;

      isPullingRef.current = false;
      const currentPullDistance = pullDistanceRef.current;

      // Trigger refresh if threshold exceeded
      if (currentPullDistance > threshold) {
        // Debounce: 500ms between refreshes
        const now = Date.now();
        if (now - lastRefreshTime.current < 500) {
          setPullDistance(0);
          pullDistanceRef.current = 0;
          return;
        }

        lastRefreshTime.current = now;
        setIsRefreshing(true);

        try {
          await onRefreshRef.current();
        } catch (error) {
          console.error("Pull to refresh error:", error);
        } finally {
          setIsRefreshing(false);
          setPullDistance(0);
          pullDistanceRef.current = 0;
        }
      } else {
        // Not enough distance, bounce back
        setPullDistance(0);
        pullDistanceRef.current = 0;
      }
    };

    // Attach listeners - dependencies are now stable
    container.addEventListener("touchstart", handleTouchStart, { passive: true });
    container.addEventListener("touchmove", handleTouchMove, { passive: false });
    container.addEventListener("touchend", handleTouchEnd, { passive: true });

    return () => {
      container.removeEventListener("touchstart", handleTouchStart);
      container.removeEventListener("touchmove", handleTouchMove);
      container.removeEventListener("touchend", handleTouchEnd);
    };
  }, [threshold, isRefreshing, disabled, isTouchDevice]);

  // 如果禁用或非触摸设备，直接渲染子元素
  if (disabled || !isTouchDevice) {
    return <div className={className}>{children}</div>;
  }

  // 计算指示器状态
  const indicatorScale = pullDistance > 30 ? 1 : pullDistance / 30;
  const showText = pullDistance > 20;
  const releaseToRefresh = pullDistance > threshold;

  return (
    <div ref={containerRef} className={className}>
      {/* Pull-down indicator */}
      <AnimatePresence>
        {(pullDistance > 0 || isRefreshing) && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{
              opacity: 1,
              height: isRefreshing ? 44 : pullDistance,
            }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="flex flex-col items-center justify-end overflow-hidden"
          >
            <div className="flex items-center gap-2 pb-2">
              {/* Spinner indicator */}
              <motion.div
                className="w-5 h-5 rounded-full border-2 border-primary/20 border-t-primary"
                animate={{
                  rotate: isRefreshing ? 360 : 0,
                  scale: indicatorScale,
                }}
                transition={{
                  rotate: {
                    repeat: isRefreshing ? Infinity : 0,
                    duration: 1,
                    ease: "linear",
                  },
                  scale: { duration: 0.2 },
                }}
              />

              {/* Text hint */}
              {showText && (
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-xs text-muted-foreground"
                >
                  {isRefreshing
                    ? t("refreshing")
                    : releaseToRefresh
                      ? t("releaseToRefresh")
                      : t("pullToRefresh")}
                </motion.span>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 子内容 */}
      {children}
    </div>
  );
}
