/**
 * Skeleton component for the main ledger page
 * Shows immediately while server-side data is loading
 */
export function LedgerPageSkeleton() {
  return (
    <div className="min-h-screen bg-bg text-text">
      {/* Header skeleton */}
      <header className="bg-surface border-b border-border sticky top-0 z-50">
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
        {/* Tabs skeleton */}
        <div className="w-full grid grid-cols-4 gap-1 bg-surface2 p-1 rounded-lg mb-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-8 bg-surface rounded animate-pulse" />
          ))}
        </div>

        {/* Content skeleton - simulates entry cards */}
        <div className="space-y-4">
          {/* Filter panel skeleton */}
          <div className="h-10 w-full bg-surface2 rounded-lg animate-pulse" />

          {/* Entry cards skeleton */}
          {[1, 2, 3].map((cardIndex) => (
            <div
              key={cardIndex}
              className="bg-surface rounded-xl border border-border overflow-hidden"
            >
              {/* Card header */}
              <div className="px-4 py-3 bg-surface2/50 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 bg-border rounded animate-pulse" />
                  <div className="h-4 w-24 bg-border rounded animate-pulse" />
                </div>
                <div className="h-4 w-16 bg-border rounded animate-pulse" />
              </div>
              {/* Card content - entry items */}
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
      </main>
    </div>
  );
}
