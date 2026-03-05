/**
 * Heatmap Color Utilities
 *
 * Color mapping logic for calendar heatmap visualization.
 * Uses project brand color (#10a37f) with opacity variants.
 */

import type { CalendarHeatmapStats, HeatmapLevel } from '../types';

// Heatmap color configuration using brand color (#10a37f)
// Using rgba with primary color mixed with surface background for reliability
const PRIMARY_RGB = '16, 163, 127'; // #10a37f in RGB
const SURFACE2_LIGHT = '#f7f7f8';
const SURFACE2_DARK = '#202123';

const HEATMAP_COLORS = {
    // Light mode colors - using rgba for reliable rendering
    light: [
        SURFACE2_LIGHT, // Level 0: No spending
        `rgba(${PRIMARY_RGB}, 0.15)`, // Level 1: Very low
        `rgba(${PRIMARY_RGB}, 0.30)`, // Level 2: Low
        `rgba(${PRIMARY_RGB}, 0.50)`, // Level 3: Medium
        `rgba(${PRIMARY_RGB}, 0.70)`, // Level 4: High
        `rgb(${PRIMARY_RGB})`, // Level 5: Very high
    ],
    // Dark mode colors
    dark: [
        SURFACE2_DARK, // Level 0: No spending
        `rgba(${PRIMARY_RGB}, 0.20)`, // Level 1: Very low
        `rgba(${PRIMARY_RGB}, 0.35)`, // Level 2: Low
        `rgba(${PRIMARY_RGB}, 0.55)`, // Level 3: Medium
        `rgba(${PRIMARY_RGB}, 0.75)`, // Level 4: High
        `rgb(${PRIMARY_RGB})`, // Level 5: Very high
    ],
};

const HEATMAP_LABELS: Record<HeatmapLevel, string> = {
    0: '无消费',
    1: '很少',
    2: '较少',
    3: '中等',
    4: '较多',
    5: '很多',
};

/**
 * Get heatmap level (0-5) based on amount and stats
 * Uses P80 as the upper bound to avoid extreme values compressing the scale
 */
export function getHeatmapLevel(
    amount: number,
    stats: CalendarHeatmapStats
): HeatmapLevel {
    if (amount <= 0) return 0;

    // Use P80 as the effective max to handle outliers
    const effectiveMax = Math.max(stats.p80Amount, stats.avgAmount * 2);

    // Guard against division by zero
    if (effectiveMax <= 0) return 0;

    const ratio = Math.min(amount / effectiveMax, 1);

    if (ratio < 0.1) return 1;
    if (ratio < 0.25) return 2;
    if (ratio < 0.5) return 3;
    if (ratio < 0.75) return 4;
    return 5;
}

/**
 * Get color for a heatmap level
 */
export function getHeatmapColor(level: HeatmapLevel, isDark = false): string {
    const colors = isDark ? HEATMAP_COLORS.dark : HEATMAP_COLORS.light;
    return colors[level];
}

/**
 * Get label for a heatmap level
 */
export function getHeatmapLabel(level: HeatmapLevel): string {
    return HEATMAP_LABELS[level];
}

/**
 * Get all heatmap legend items
 */
export function getHeatmapLegend(isDark = false) {
    const levels: HeatmapLevel[] = [0, 1, 2, 3, 4, 5];
    return levels.map((level) => ({
        level,
        color: getHeatmapColor(level, isDark),
        label: getHeatmapLabel(level),
    }));
}

/**
 * Check if amount text should be shown in cell
 * Only show text for larger cells or lower levels (better contrast)
 */
export function shouldShowAmount(
    amount: number,
    cellSize: 'sm' | 'md' | 'lg'
): boolean {
    if (amount <= 0) return false;

    switch (cellSize) {
        case 'sm':
            return false; // Never show in small cells
        case 'md':
            return amount >= 100; // Only show for larger amounts
        case 'lg':
            return true; // Always show in large cells
    }
}

/**
 * Format amount for display in cell (abbreviated)
 */
export function formatCellAmount(amount: number): string {
    if (amount >= 10000) {
        return `${Math.round(amount / 1000)}k`;
    }
    if (amount >= 1000) {
        return `${(amount / 1000).toFixed(1)}k`;
    }
    return Math.round(amount).toString();
}
