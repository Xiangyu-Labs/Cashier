/**
 * Skeleton component for the main ledger page
 * Shows immediately while server-side data is loading
 */
export function LedgerPageSkeleton() {
  return (
    <div className="min-h-screen bg-bg text-text">
      {/* Header skeleton */}
      <header className="bg-surface border-b border-border sticky top-0 z-header">
        <div className="w-full max-w-md md:max-w-3xl lg:max-w-5xl mx-auto px-4 h-14 flex justify-between items-center">
          <div className="flex items-center gap-2">
            {/* Ledger switcher skeleton */}
            <div className="h-8 w-24 bg-surface2 rounded-lg animate-pulse" />
            {/* Task queue button skeleton */}
            <div className="h-8 w-8 bg-surface2 rounded-full animate-pulse" />
          </div>
          <div className="flex items-center gap-2">
            {/* Add button skeleton */}
            <div className="h-8 w-8 bg-primary/20 rounded-full animate-pulse" />
          </div>
        </div>
      </header>

      <main className="w-full max-w-md md:max-w-3xl lg:max-w-5xl mx-auto p-4">
        {/* Tabs skeleton - matches actual TabsList */}
        <div className="w-full grid grid-cols-4 gap-1 bg-surface2 p-1 rounded-lg mb-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-8 bg-surface rounded animate-pulse" />
          ))}
        </div>

        {/* Content skeleton - Entries tab structure */}
        <div className="space-y-4">
          {/* Filter toolbar - matches: select button + filter panel + total */}
          <div className="flex items-center gap-2 mb-2 sm:mb-4">
            {/* Select mode button */}
            <div className="h-8 w-8 bg-surface2 rounded-md animate-pulse shrink-0" />
            {/* Filter panel */}
            <div className="h-8 w-28 bg-surface2 rounded-md animate-pulse" />
            {/* Spacer */}
            <div className="flex-1" />
            {/* Total amount text */}
            <div className="h-4 w-28 bg-surface2 rounded animate-pulse font-mono" />
          </div>

          {/* Date group skeletons */}
          {[1, 2, 3].map((dateGroupIndex) => (
            <div key={dateGroupIndex} className="space-y-2">
              {/* Date header - matches: dot indicator + date + daily total */}
              <div className="py-2 px-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {/* Dot indicator */}
                  <div className="w-1.5 h-1.5 rounded-full bg-surface2 animate-pulse" />
                  {/* Date text */}
                  <div className="h-3 w-24 bg-surface2 rounded animate-pulse" />
                </div>
                {/* Daily total */}
                <div className="h-3 w-20 bg-surface2 rounded animate-pulse font-mono" />
              </div>

              {/* Source document cards for this date */}
              {[1, 2].map((cardIndex) => (
                <div
                  key={cardIndex}
                  className="bg-surface rounded-xl border border-border overflow-hidden"
                >
                  {/* Card header - matches: expand icon + date + title + amount + more button */}
                  <div className="px-4 py-3 bg-surface2/50 border-b border-border flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      {/* Expand/collapse chevron */}
                      <div className="h-4 w-4 bg-border rounded animate-pulse shrink-0" />
                      {/* Date (e.g., "3月5日") */}
                      <div className="h-4 w-12 bg-border rounded animate-pulse shrink-0" />
                      {/* Title (e.g., "赫赫海鲜晚餐") */}
                      <div className="h-4 w-28 bg-border rounded animate-pulse" />
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      {/* Amount */}
                      <div className="h-4 w-16 bg-border rounded animate-pulse font-mono" />
                      {/* More menu button */}
                      <div className="h-7 w-7 bg-border rounded animate-pulse" />
                    </div>
                  </div>

                  {/* Card content - ledger entries */}
                  <div className="p-3 space-y-3 bg-surface2/30">
                    {[1, 2].map((entryIndex) => (
                      <div key={entryIndex} className="flex items-center justify-between py-1">
                        <div className="flex items-center gap-3">
                          {/* Category/merchant icon */}
                          <div className="h-8 w-8 rounded-full bg-border animate-pulse" />
                          <div className="space-y-1.5">
                            {/* Entry title */}
                            <div className="h-4 w-24 bg-border rounded animate-pulse" />
                            {/* Category/subtitle */}
                            <div className="h-3 w-16 bg-border rounded animate-pulse" />
                          </div>
                        </div>
                        {/* Entry amount */}
                        <div className="h-4 w-14 bg-border rounded animate-pulse font-mono" />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
