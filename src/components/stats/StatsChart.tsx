"use client";

import { useMemo } from "react";
import { DateRangeType, formatDateForApi } from "@/lib/date-utils";


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

                points.push({
                    label: `${month + 1}月`,
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
                const dateStr = formatDateForApi(curr);
                const found = data.find(d => d.date === dateStr);

                let label = "";
                if (rangeType === "week") {
                    // Mon, Tue... (Use Chinese)
                    const split = ["日", "一", "二", "三", "四", "五", "六"];
                    label = split[curr.getDay()];
                } else {
                    // Day number for Month view
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
    }, [data, rangeType, startDate, endDate, isLoading]);

    const maxVal = Math.max(...chartPoints.map(p => p.value), 1); // Avoid div by 0

    // Y-Axis lines (0, 50%, 100% of visual range approx)
    // We want the chart to take up most height but leave room for labels.

    // SVG Coordinates
    // Width: 100% (viewBox 0 0 100 100, preserveAspectRatio none)
    // But points need to be mapped.

    if (isLoading) {
        return <div className="h-48 w-full bg-surface2/30 animate-pulse rounded-lg" />;
    }

    if (chartPoints.length === 0) return null;

    return (
        <div className="w-full h-52 relative pt-6 pb-6 select-none">
            {/* Grid Lines */}
            <div className="absolute inset-x-0 top-6 bottom-8 flex flex-col justify-between pointer-events-none">
                <div className="border-b border-dashed border-border/40 w-full h-[1px]" />
                <div className="border-b border-dashed border-border/40 w-full h-[1px]" />
                <div className="border-b border-dashed border-border/40 w-full h-[1px]" />
            </div>

            {/* Chart Area */}
            <div className="h-full w-full px-2">
                <svg className="w-full h-full overflow-visible" preserveAspectRatio="none">
                    {/* Line Path */}
                    <polyline
                        points={chartPoints.map((p, i) => {
                            const x = (i / (chartPoints.length - 1)) * 100;
                            // Leave 10% padding top/bottom inside the chart area
                            // value=0 -> y=90%, value=max -> y=10%
                            const y = 90 - (p.value / maxVal) * 80;
                            return `${x}%,${y}%`;
                        }).join(" ")}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        className="text-primary transition-all duration-300 ease-in-out"
                        strokeLinejoin="round"
                        strokeLinecap="round"
                    />

                    {/* Points (Only show if sparse enough or interactive) */}
                    {/* For Year/Week: Show all points. For Month: Show none or only non-zero? */}
                    {(rangeType !== "month" || chartPoints.length < 15) && chartPoints.map((p, i) => {
                        const x = (i / (chartPoints.length - 1)) * 100;
                        const y = 90 - (p.value / maxVal) * 80;
                        return (
                            <circle
                                key={i}
                                cx={`${x}%`}
                                cy={`${y}%`}
                                r="3.5"
                                className="fill-bg stroke-primary stroke-[2px]"
                            />
                        );
                    })}
                </svg>

                {/* X Axis Labels */}
                <div className="relative mt-2 h-6 w-full">
                    {chartPoints.map((p, i) => {
                        // Label Filtering
                        let showLabel = false;
                        if (rangeType === "week" || rangeType === "year") {
                            showLabel = true;
                            // For year, if screen is small, maybe every 2nd? 
                            // But usually 12 items fit. 1,2,3...12.
                        } else if (rangeType === "month") {
                            // Show 1, 6, 11, 16, 21, 26, 31 (Every 5 days + last day?)
                            // Or just indices % 5 === 0
                            if (i === 0 || i === chartPoints.length - 1 || (i) % 5 === 0) {
                                showLabel = true;
                            }
                        }

                        if (!showLabel) return null;

                        const leftPos = (i / (chartPoints.length - 1)) * 100;

                        return (
                            <div
                                key={i}
                                className="absolute text-[10px] text-muted transform -translate-x-1/2 text-center w-8"
                                style={{ left: `${leftPos}%` }}
                            >
                                {p.label}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
