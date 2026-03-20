export function LedgerEntriesLoading() {
  return (
    <div className="space-y-6 px-1 animate-pulse">
      {[1, 2, 3].map((dateGroupIdx) => (
        <div key={dateGroupIdx} className="space-y-2">
          <div className="py-2 px-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-surface2" />
              <div className="h-3 w-24 bg-surface2 rounded" />
            </div>
            <div className="h-3 w-20 bg-surface2 rounded font-mono" />
          </div>

          {[1, 2].map((idx) => (
            <div key={idx} className="bg-surface rounded-xl border border-border overflow-hidden">
              <div className="px-4 py-3 bg-surface2/50 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <div className="h-4 w-4 bg-border rounded shrink-0" />
                  <div className="h-4 w-12 bg-border rounded shrink-0" />
                  <div className="h-4 w-28 bg-border rounded" />
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  <div className="h-4 w-16 bg-border rounded font-mono" />
                  <div className="h-7 w-7 bg-border rounded" />
                </div>
              </div>

              <div className="p-3 space-y-3 bg-surface2/30">
                {[1, 2].map((entryIdx) => (
                  <div key={entryIdx} className="flex items-center justify-between py-1">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-border" />
                      <div className="space-y-1.5">
                        <div className="h-4 w-24 bg-border rounded" />
                        <div className="h-3 w-16 bg-border rounded" />
                      </div>
                    </div>
                    <div className="h-4 w-14 bg-border rounded font-mono" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
