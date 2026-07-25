import { useCallback, useEffect, useRef, useState } from "react";

interface UseInfiniteScrollOptions {
  hasNextPage?: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
  rootMargin?: string;
}

/**
 * 无限滚动 Hook，使用 Intersection Observer API
 * 当用户滚动到距离底部指定距离时自动加载下一页
 *
 * @param hasNextPage - 是否还有下一页
 * @param isFetchingNextPage - 是否正在加载下一页
 * @param fetchNextPage - 加载下一页的函数
 * @param rootMargin - 提前触发的距离，默认 '200px'
 * @returns sentinelRef - 哨兵元素的 ref，需要绑定到列表底部的元素上
 */
export function useInfiniteScroll({
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
  rootMargin = "200px",
}: UseInfiniteScrollOptions) {
  const [sentinel, setSentinel] = useState<HTMLDivElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const loadRequestedRef = useRef(false);
  const sentinelRef = useCallback((node: HTMLDivElement | null) => {
    setSentinel(node);
  }, []);

  useEffect(() => {
    if (!hasNextPage || !isFetchingNextPage) loadRequestedRef.current = false;
  }, [hasNextPage, isFetchingNextPage]);

  useEffect(() => {
    if (!sentinel) return;

    const loadNextPage = () => {
      if (hasNextPage && !isFetchingNextPage && !loadRequestedRef.current) {
        loadRequestedRef.current = true;
        fetchNextPage();
      }
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting === true) loadNextPage();
      },
      { rootMargin }
    );

    // WebKit in standalone PWA mode can miss implicit-viewport intersection
    // updates. Checking the sentinel on scroll also covers that case.
    const preloadDistance = Number.parseFloat(rootMargin) || 0;
    const checkSentinelPosition = () => {
      frameRef.current = null;
      const viewportHeight = Math.max(
        window.innerHeight,
        document.documentElement.clientHeight,
        window.visualViewport?.height ?? 0
      );
      if (sentinel.getBoundingClientRect().top <= viewportHeight + preloadDistance) {
        loadNextPage();
      }
    };
    const schedulePositionCheck = () => {
      if (frameRef.current == null) {
        frameRef.current = window.requestAnimationFrame(checkSentinelPosition);
      }
    };

    observer.observe(sentinel);
    document.addEventListener("scroll", schedulePositionCheck, true);
    window.addEventListener("resize", schedulePositionCheck);
    window.visualViewport?.addEventListener("resize", schedulePositionCheck);
    window.visualViewport?.addEventListener("scroll", schedulePositionCheck);
    schedulePositionCheck();

    return () => {
      observer.disconnect();
      document.removeEventListener("scroll", schedulePositionCheck, true);
      window.removeEventListener("resize", schedulePositionCheck);
      window.visualViewport?.removeEventListener("resize", schedulePositionCheck);
      window.visualViewport?.removeEventListener("scroll", schedulePositionCheck);
      if (frameRef.current != null) window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    };
  }, [sentinel, hasNextPage, isFetchingNextPage, fetchNextPage, rootMargin]);

  return sentinelRef;
}
