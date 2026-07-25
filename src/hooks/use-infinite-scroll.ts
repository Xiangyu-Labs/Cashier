import { useEffect, useRef } from "react";

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
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry != null && entry.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, rootMargin]);

  return sentinelRef;
}
