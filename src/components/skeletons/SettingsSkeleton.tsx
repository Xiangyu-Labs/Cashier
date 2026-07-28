/**
 * Skeleton component for settings pages
 * Shows immediately while server-side data is loading
 */
export function SettingsSkeleton() {
  return (
    <div className="min-h-screen bg-bg text-text">
      {/* Header skeleton */}
      <header className="bg-surface border-b border-border sticky top-0 z-header">
        <div className="w-full max-w-md md:max-w-3xl lg:max-w-5xl mx-auto px-4 h-14 flex justify-between items-center">
          <div className="flex items-center gap-2">
            {/* Back button skeleton */}
            <div className="h-8 w-8 bg-surface2 rounded-lg animate-pulse" />
            {/* Title skeleton */}
            <div className="h-6 w-32 bg-surface2 rounded animate-pulse" />
          </div>
        </div>
      </header>

      <main className="relative z-content w-full max-w-md md:max-w-3xl lg:max-w-5xl mx-auto p-4 space-y-6">
        {/* Settings sections skeleton - 5 sections matching SettingsTab */}
        {[1, 2, 3, 4, 5].map((sectionIndex) => (
          <div key={sectionIndex} className="space-y-4">
            {/* Section title */}
            <div className="h-5 w-28 bg-surface2 rounded animate-pulse" />

            {/* Section content with multiple setting items */}
            <div className="space-y-4 pt-2">
              {[1, 2, 3].map((itemIndex) => (
                <div key={itemIndex}>
                  {/* Setting item with label + description + control */}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    {/* Label and description */}
                    <div className="space-y-1.5 flex-1">
                      <div className="h-4 w-24 bg-surface2 rounded animate-pulse" />
                      <div className="h-3 w-40 bg-surface2/70 rounded animate-pulse" />
                    </div>
                    {/* Control (button, switch, or select) */}
                    <div className="h-8 w-24 bg-surface2 rounded animate-pulse shrink-0" />
                  </div>
                  {/* Divider between items (except last) */}
                  {itemIndex < 3 && <div className="h-px bg-border mt-4" />}
                </div>
              ))}
            </div>
          </div>
        ))}
      </main>
    </div>
  );
}
