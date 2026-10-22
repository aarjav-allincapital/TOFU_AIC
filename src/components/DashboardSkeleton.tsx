const GRID =
  "grid-cols-[minmax(0,2.4fr)_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,0.9fr)_110px]";

function Shimmer({ className }: { className?: string }) {
  return (
    <div
      className={`skeleton-shimmer rounded-md bg-surface-muted ${className ?? ""}`}
    />
  );
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-xl border border-border bg-surface">
        <div className="grid grid-cols-2 divide-x divide-border lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="px-6 py-5">
              <Shimmer className="h-3 w-20" />
              <Shimmer className="mt-3 h-8 w-14" />
              <Shimmer className="mt-2 h-3 w-28" />
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-border bg-surface p-5">
        <Shimmer className="h-4 w-40" />
        <Shimmer className="mt-2 h-3 w-56" />
        <div className="mt-4 space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Shimmer className="h-9 w-9 rounded-md" />
              <div className="flex-1 space-y-2">
                <Shimmer className="h-3.5 w-40" />
                <Shimmer className="h-3 w-56" />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
