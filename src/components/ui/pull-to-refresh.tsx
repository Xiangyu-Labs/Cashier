"use client";

import { useState, useRef, useEffect, ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

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
    const startYRef = useRef(0);
    const containerRef = useRef<HTMLDivElement>(null);
    const lastRefreshTime = useRef(0);
    const isPullingRef = useRef(false);

    // 检测是否为桌面端（没有触摸支持）
    const isTouchDevice = typeof window !== "undefined" && "ontouchstart" in window;

    useEffect(() => {
        // 如果禁用或非触摸设备，不添加监听器
        if (disabled || !isTouchDevice) return;

        const container = containerRef.current;
        if (!container) return;

        const handleTouchStart = (e: TouchEvent) => {
            // 只有在容器顶部时才允许下拉
            const scrollTop = container.scrollTop;
            // 兼容 body 滚动：如果容器没有滚动条，检查 window 滚动位置
            const bodyScrollTop = window.scrollY || document.documentElement.scrollTop;

            // 只有都在顶部才允许触发
            if (scrollTop === 0 && bodyScrollTop === 0 && !isRefreshing) {
                startYRef.current = e.touches[0].clientY;
                isPullingRef.current = true;
            }
        };

        const handleTouchMove = (e: TouchEvent) => {
            if (!isPullingRef.current || isRefreshing) return;

            const currentY = e.touches[0].clientY;
            const distance = currentY - startYRef.current;
            const containerScrollTop = container.scrollTop;
            const bodyScrollTop = window.scrollY || document.documentElement.scrollTop;

            // 只在向下拉且在顶部时生效
            if (distance > 0 && containerScrollTop === 0 && bodyScrollTop === 0) {
                // 阻止默认的页面滚动行为
                if (e.cancelable) e.preventDefault();

                // 限制最大拉动距离为 80px，并应用阻尼效果
                const maxDistance = 80;
                const damping = 0.5;
                const dampedDistance = Math.min(distance * damping, maxDistance);

                setPullDistance(dampedDistance);
            }
        };

        const handleTouchEnd = async () => {
            if (!isPullingRef.current) return;

            isPullingRef.current = false;

            // 如果拉动距离超过阈值，触发刷新
            if (pullDistance > threshold) {
                // 防抖：500ms 内不允许重复触发
                const now = Date.now();
                if (now - lastRefreshTime.current < 500) {
                    setPullDistance(0);
                    return;
                }

                lastRefreshTime.current = now;
                setIsRefreshing(true);

                try {
                    await onRefresh();
                } catch (error) {
                    console.error("Pull to refresh error:", error);
                } finally {
                    setIsRefreshing(false);
                    setPullDistance(0);
                }
            } else {
                // 距离不够，回弹
                setPullDistance(0);
            }
        };

        // 使用 passive: false 以便可以调用 preventDefault()
        container.addEventListener("touchstart", handleTouchStart, { passive: true });
        container.addEventListener("touchmove", handleTouchMove, { passive: false });
        container.addEventListener("touchend", handleTouchEnd, { passive: true });

        return () => {
            container.removeEventListener("touchstart", handleTouchStart);
            container.removeEventListener("touchmove", handleTouchMove);
            container.removeEventListener("touchend", handleTouchEnd);
        };
    }, [pullDistance, threshold, isRefreshing, onRefresh, disabled, isTouchDevice]);

    // 如果禁用或非触摸设备，直接渲染子元素
    if (disabled || !isTouchDevice) {
        return <div className={cn("h-full overflow-auto", className)}>{children}</div>;
    }

    // 计算指示器状态
    const indicatorScale = pullDistance > 30 ? 1 : pullDistance / 30;
    const showText = pullDistance > 20;
    const releaseToRefresh = pullDistance > threshold;

    return (
        <div
            ref={containerRef}
            className={cn("h-full overflow-auto", className)}
        >
            {/* 下拉指示器 */}
            <AnimatePresence>
                {(pullDistance > 0 || isRefreshing) && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{
                            opacity: 1,
                            height: isRefreshing ? 44 : pullDistance
                        }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                        className="flex flex-col items-center justify-end overflow-hidden"
                    >
                        <div className="flex items-center gap-2 pb-2">
                            {/* 旋转指示器 */}
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

                            {/* 文字提示 */}
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
