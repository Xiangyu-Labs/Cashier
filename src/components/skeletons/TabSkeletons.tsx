/**
 * Lightweight skeleton components for tab content areas.
 * Used as Suspense fallbacks when tab data is loading.
 */

/**
 * Skeleton for the LedgerEntries (流水) tab.
 * Shows filter bar + entry card placeholders.
 */
export function EntriesTabSkeleton() {
    return (
        <div className="space-y-4">
            {/* Filter panel skeleton */}
            <div className="h-10 w-full bg-surface2 rounded-lg animate-pulse" />

            {/* Entry cards skeleton */}
            {[1, 2, 3].map((cardIndex) => (
                <div
                    key={cardIndex}
                    className="bg-surface rounded-xl border border-border overflow-hidden"
                >
                    <div className="px-4 py-3 bg-surface2/50 border-b border-border flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <div className="h-4 w-4 bg-border rounded animate-pulse" />
                            <div className="h-4 w-24 bg-border rounded animate-pulse" />
                        </div>
                        <div className="h-4 w-16 bg-border rounded animate-pulse" />
                    </div>
                    <div className="p-3 space-y-3">
                        {[1, 2].map((entryIndex) => (
                            <div key={entryIndex} className="flex items-center justify-between py-1">
                                <div className="flex items-center gap-3">
                                    <div className="h-8 w-8 rounded-full bg-border animate-pulse" />
                                    <div className="space-y-1.5">
                                        <div className="h-4 w-28 bg-border rounded animate-pulse" />
                                        <div className="h-3 w-16 bg-border rounded animate-pulse" />
                                    </div>
                                </div>
                                <div className="h-4 w-14 bg-border rounded animate-pulse" />
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}

/**
 * Skeleton for the Details tab.
 * Shows a list of detail item placeholders.
 */
export function DetailsTabSkeleton() {
    return (
        <div className="space-y-3">
            {/* Search/filter skeleton */}
            <div className="h-10 w-full bg-surface2 rounded-lg animate-pulse" />

            {/* Detail items skeleton */}
            {[1, 2, 3, 4, 5].map((i) => (
                <div
                    key={i}
                    className="flex items-center justify-between px-4 py-3 bg-surface rounded-xl border border-border"
                >
                    <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-border animate-pulse" />
                        <div className="space-y-1.5">
                            <div className="h-4 w-32 bg-border rounded animate-pulse" />
                            <div className="h-3 w-20 bg-border rounded animate-pulse" />
                        </div>
                    </div>
                    <div className="h-4 w-16 bg-border rounded animate-pulse" />
                </div>
            ))}
        </div>
    );
}

/**
 * Skeleton for the Stats tab.
 * Shows chart area + summary card placeholders.
 */
export function StatsTabSkeleton() {
    return (
        <div className="space-y-4">
            {/* Period selector skeleton */}
            <div className="flex gap-2">
                {[1, 2, 3].map((i) => (
                    <div key={i} className="h-8 w-16 bg-surface2 rounded-lg animate-pulse" />
                ))}
            </div>

            {/* Chart area skeleton */}
            <div className="bg-surface rounded-xl border border-border p-4">
                <div className="h-5 w-24 bg-border rounded animate-pulse mb-4" />
                <div className="h-48 w-full bg-surface2 rounded-lg animate-pulse" />
            </div>

            {/* Summary cards skeleton */}
            <div className="grid grid-cols-2 gap-3">
                {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="bg-surface rounded-xl border border-border p-4 space-y-2">
                        <div className="h-3 w-16 bg-border rounded animate-pulse" />
                        <div className="h-6 w-24 bg-border rounded animate-pulse" />
                    </div>
                ))}
            </div>
        </div>
    );
}

/**
 * Skeleton for the Settings tab.
 * Shows settings section placeholders.
 */
export function SettingsTabSkeleton() {
    return (
        <div className="space-y-6">
            {[1, 2].map((sectionIndex) => (
                <div key={sectionIndex} className="space-y-3">
                    <div className="h-5 w-24 bg-border rounded animate-pulse" />
                    <div className="bg-surface rounded-xl border border-border divide-y divide-border">
                        {[1, 2, 3].map((itemIndex) => (
                            <div key={itemIndex} className="px-4 py-3 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="h-5 w-5 bg-border rounded animate-pulse" />
                                    <div className="h-4 w-28 bg-border rounded animate-pulse" />
                                </div>
                                <div className="h-6 w-10 bg-border rounded-full animate-pulse" />
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}
