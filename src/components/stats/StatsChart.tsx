"use client";

import { useMemo } from "react";
import { DateRangeType, formatDateTimeForApi } from "@/lib/date-utils";
import { useLocale } from "next-intl";


interface StatsChartProps {
    data: { date: string; total: number }[];
    rangeType: DateRangeType;
    startDate: Date;
    endDate: Date;
    isLoading?: boolean;
}

export function StatsChart({
    data = [],
    rangeType,
    startDate,
    endDate,
    isLoading
}: StatsChartProps) {
    const locale = useLocale();

    // Process Data based on Range Type
    const chartPoints = useMemo(() => {
        if (isLoading) return [];

        const points: { label: string; value: number; fullDate: string }[] = [];

        if (rangeType === "year") {
            // Aggregate by Month (12 points)
            const year = startDate.getFullYear();
            for (let month = 0; month < 12; month++) {
                // Determine pattern for this month: "YYYY-MM"
                const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`;

                // Sum all entries starting with this prefix
                const total = data
                    .filter(d => d.date.startsWith(monthPrefix))
                    .reduce((sum, d) => sum + d.total, 0);

                const monthLabel = new Date(year, month, 1).toLocaleString(locale, { month: "short" });

                points.push({
                    label: monthLabel,
                    value: total,
                    fullDate: monthPrefix // Just for key/ref
                });
            }
        } else {
            // Daily granularity (Week or Month)
            const curr = new Date(startDate);
            const end = new Date(endDate);

            // Safety break to prevent infinite loops if dates are weird
            let safety = 0;
            while (curr <= end && safety < 400) {
                const dateStr = formatDateTimeForApi(curr);
                const found = data.find(d => d.date === dateStr);

                let label = "";
                if (rangeType === "week") {
                    label = curr.toLocaleString(locale, { weekday: "short" });
                } else {
                    // Day number for Month or currentPeriod view
                    label = String(curr.getDate());
                }

                points.push({
                    label,
                    value: found ? found.total : 0,
                    fullDate: dateStr
                });

                curr.setDate(curr.getDate() + 1);
                safety++;
            }
        }
        return points;
    }, [data, rangeType, startDate, endDate, isLoading, locale]);

    const maxVal = Math.max(...chartPoints.map(p => p.value), 1); // Avoid div by 0

    if (isLoading) {
        return <div className="h-48 w-full bg-surface2/30 animate-pulse rounded-lg" />;
    }

    if (chartPoints.length === 0) return null;

    // Calculate chart dimensions (chart area height)
    const chartHeight = 130; // pixels, matches h-full minus padding
    const paddingTop = 10;   // 10% top padding
    const paddingBottom = 10; // 10% bottom padding

    return (
        <div className="w-full h-52 relative pt-6 pb-6 select-none">
            {/* Grid Lines */}
            <div className="absolute inset-x-0 top-6 bottom-8 flex flex-col justify-between pointer-events-none">
                <div className="border-b border-dashed border-border/40 w-full h-[1px]" />
                <div className="border-b border-dashed border-border/40 w-full h-[1px]" />
                <div className="border-b border-dashed border-border/40 w-full h-[1px]" />
            </div>

            {/* Chart Area - Using relative positioning for points */}
            <div className="h-full w-full px-2 relative" style={{ height: `${chartHeight}px` }}>
                {/* SVG for line only - stretched horizontally */}
                <svg
                    className="absolute inset-0 w-full h-full overflow-visible"
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                >
                    {/* Line Path */}
                    {chartPoints.length > 1 && (
                        <polyline
                            points={chartPoints.map((p, i) => {
                                const xPercent = chartPoints.length === 1
                                    ? 50
                                    : (i / (chartPoints.length - 1)) * 100;
                                // Calculate y position (inverted: 0 at top)
                                const yPercent = paddingTop + (1 - p.value / maxVal) * (100 - paddingTop - paddingBottom);
                                return `${xPercent},${yPercent}`;
                            }).join(" ")}
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            className="text-primary transition-all duration-300 ease-in-out"
                            strokeLinejoin="round"
                            strokeLinecap="round"
                            vectorEffect="non-scaling-stroke"
                        />
                    )}
                </svg>

                {/* Points - Using absolute positioning with CSS (no SVG distortion) */}
                {chartPoints.map((p, i) => {
                    const leftPercent = chartPoints.length === 1
                        ? 50
                        : (i / (chartPoints.length - 1)) * 100;
                    // Calculate top position
                    const topPercent = paddingTop + (1 - p.value / maxVal) * (100 - paddingTop - paddingBottom);

                    return (
                        <div
                            key={i}
                            className="absolute w-[7px] h-[7px] rounded-full bg-bg border-2 border-primary -translate-x-1/2 -translate-y-1/2 transition-all duration-300"
                            style={{
                                left: `${leftPercent}%`,
                                top: `${topPercent}%`,
                            }}
                        />
                    );
                })}
            </div>

            {/* X Axis Labels */}
            <div className="relative mt-2 h-6 w-full px-2">
                {chartPoints.map((p, i) => {
                    // Label Filtering
                    let showLabel = false;
                    if (rangeType === "week" || rangeType === "year") {
                        showLabel = true;
                    } else if (rangeType === "month" || rangeType === "currentPeriod") {
                        // Show 1, 6, 11, 16, 21, 26, 31 (Every 5 days + last day?)
                        if (i === 0 || i === chartPoints.length - 1 || (i) % 5 === 0) {
                            showLabel = true;
                        }
                    }

                    if (!showLabel) return null;

                    const leftPos = chartPoints.length === 1
                        ? 50
                        : (i / (chartPoints.length - 1)) * 100;

                    return (
                        <div
                            key={i}
                            className="absolute text-[10px] text-muted-foreground transform -translate-x-1/2 text-center w-8"
                            style={{ left: `${leftPos}%` }}
                        >
                            {p.label}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
