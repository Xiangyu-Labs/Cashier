/**
 * Skeleton component for settings pages
 * Shows immediately while server-side data is loading
 */
export function SettingsSkeleton() {
  return (
    <div className="min-h-screen bg-bg text-text">
      {/* Header skeleton */}
      <header className="bg-surface border-b border-border sticky top-0 z-50">
        <div className="w-full max-w-md md:max-w-3xl lg:max-w-5xl mx-auto px-4 h-14 flex justify-between items-center">
          <div className="flex items-center gap-2">
            {/* Back button skeleton */}
            <div className="h-8 w-8 bg-surface2 rounded-lg animate-pulse" />
            {/* Title skeleton */}
            <div className="h-6 w-32 bg-surface2 rounded animate-pulse" />
          </div>
        </div>
      </header>

      <main className="w-full max-w-md md:max-w-3xl lg:max-w-5xl mx-auto p-4 space-y-6">
        {/* Settings sections skeleton */}
        {[1, 2, 3].map((sectionIndex) => (
          <div key={sectionIndex} className="space-y-3">
            {/* Section title */}
            <div className="h-5 w-24 bg-border rounded animate-pulse" />

            {/* Settings items */}
            <div className="bg-surface rounded-xl border border-border divide-y divide-border">
              {[1, 2, 3].map((itemIndex) => (
                <div
                  key={itemIndex}
                  className="px-4 py-3 flex items-center justify-between"
                >
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
      </main>
    </div>
  );
}
