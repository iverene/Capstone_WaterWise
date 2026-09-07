function SkeletonBlock({ className = "" }) {
  return (
    <div
      aria-hidden="true"
      className={`waterwise-skeleton-shimmer rounded-xl bg-gradient-to-r from-slate-100 via-slate-200/70 to-slate-100 bg-[length:200%_100%] ${className}`}
    />
  );
}

function CardSkeleton() {
  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
      <div className="flex items-center justify-between gap-4">
        <SkeletonBlock className="h-10 w-10" />
        <SkeletonBlock className="h-8 w-8" />
      </div>
      <SkeletonBlock className="h-3 w-32" />
      <SkeletonBlock className="h-9 w-28" />
      <SkeletonBlock className="h-3 w-44 max-w-full" />
    </div>
  );
}

function InlineSkeleton() {
  return <div className="space-y-3"><SkeletonBlock className="h-9 w-32" /><SkeletonBlock className="h-3 w-44 max-w-full" /></div>;
}

function ListSkeleton({ count }) {
  return (
    <div className="grid gap-3">
      {Array.from({ length: count }, (_, index) => (
        <div className="rounded-2xl border border-slate-200 bg-white p-4" key={index}>
          <div className="flex items-start gap-3">
            <SkeletonBlock className="h-11 w-11 shrink-0" />
            <div className="min-w-0 flex-1">
              <SkeletonBlock className="h-4 w-48 max-w-[75%]" />
              <SkeletonBlock className="mt-3 h-3 w-full" />
              <SkeletonBlock className="mt-2 h-3 w-2/3" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function TableSkeleton({ count }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="hidden grid-cols-5 gap-4 border-b border-slate-200 bg-slate-50 px-4 py-3 md:grid">
        {Array.from({ length: 5 }, (_, index) => <SkeletonBlock className="h-3 w-20" key={index} />)}
      </div>
      <div className="divide-y divide-slate-100">
        {Array.from({ length: count }, (_, index) => (
          <div className="grid gap-3 p-4 md:grid-cols-5 md:items-center" key={index}>
            <SkeletonBlock className="h-4 w-40" />
            <SkeletonBlock className="h-4 w-24" />
            <SkeletonBlock className="h-4 w-28" />
            <SkeletonBlock className="h-7 w-20 rounded-full" />
            <SkeletonBlock className="h-11 w-full md:ml-auto md:w-24" />
          </div>
        ))}
      </div>
    </div>
  );
}

function ChartBodySkeleton() {
  const heights = ["h-[36%]", "h-[58%]", "h-[45%]", "h-[74%]", "h-[62%]", "h-[86%]", "h-[68%]"];
  return (
    <div className="mt-2">
      <div className="flex h-52 items-end gap-3 overflow-hidden sm:h-64">
        {heights.map((height, index) => <SkeletonBlock className={`min-w-6 flex-1 rounded-b-sm rounded-t-xl ${height}`} key={index} />)}
      </div>
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1"><SkeletonBlock className="h-3 w-24" /><SkeletonBlock className="mt-3 h-6 w-52 max-w-full" /></div>
        <SkeletonBlock className="h-11 w-11 shrink-0" />
      </div>
      <div className="mt-6"><ChartBodySkeleton /></div>
    </div>
  );
}

function CalendarSkeleton() {
  return (
    <div className="grid grid-cols-1 items-start gap-5">
      <div className="order-2 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
        <div className="flex items-center justify-between gap-4 border-b border-slate-200 p-5">
          <div><SkeletonBlock className="h-3 w-24" /><SkeletonBlock className="mt-3 h-7 w-44" /></div>
          <div className="flex gap-2"><SkeletonBlock className="h-11 w-11" /><SkeletonBlock className="h-11 w-20" /><SkeletonBlock className="h-11 w-11" /></div>
        </div>
        <div className="grid grid-cols-7 gap-px bg-slate-100 p-px">
          {Array.from({ length: 49 }, (_, index) => (
            <div className={`${index < 7 ? "min-h-10 bg-slate-50" : "min-h-20 bg-white sm:min-h-28"} p-2`} key={index}>
              {index >= 7 && <SkeletonBlock className="h-7 w-7 rounded-full" />}
              {index >= 14 && index % 4 === 0 && <SkeletonBlock className="mt-2 hidden h-6 w-full sm:block" />}
            </div>
          ))}
        </div>
      </div>
      <div className="order-1 rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <SkeletonBlock className="h-3 w-24" />
        <SkeletonBlock className="mt-3 h-6 w-56 max-w-full" />
        <SkeletonBlock className="mt-2 h-3 w-32" />
        <div className="mt-5"><CardSkeleton /></div>
      </div>
    </div>
  );
}

function MetricsSkeleton() {
  return (
    <>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card sm:p-5">
        <div className="flex items-start gap-3">
          <SkeletonBlock className="h-10 w-10 shrink-0" />
          <div className="min-w-0 flex-1">
            <SkeletonBlock className="h-3 w-24" />
            <SkeletonBlock className="mt-3 h-5 w-64 max-w-full" />
            <SkeletonBlock className="mt-2 h-3 w-80 max-w-full" />
          </div>
          <SkeletonBlock className="hidden h-8 w-32 rounded-full sm:block" />
        </div>
        <div className="mt-4 flex items-center justify-between gap-4 border-t border-slate-200 pt-4">
          <SkeletonBlock className="h-3 w-32" />
          <SkeletonBlock className="h-11 w-48" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:gap-4 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-card sm:p-5" key={index}>
            <div className="flex items-center gap-2 sm:gap-3">
              <SkeletonBlock className="h-9 w-9 shrink-0" />
              <SkeletonBlock className="h-3 w-20" />
            </div>
            <SkeletonBlock className="mt-4 h-7 w-24 sm:mt-5" />
            <SkeletonBlock className="mt-2 h-3 w-28 max-w-full" />
          </div>
        ))}
      </div>
      <ChartSkeleton />
    </>
  );
}

function HomeMetricsSkeleton() {
  return (
    <>
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <SkeletonBlock className="h-11 w-11 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1">
              <SkeletonBlock className="h-3 w-24" />
              <SkeletonBlock className="mt-2 h-5 w-36 max-w-full" />
              <SkeletonBlock className="mt-2 h-4 w-72 max-w-full" />
            </div>
          </div>
          <SkeletonBlock className="h-11 w-full shrink-0 sm:w-28" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:gap-4 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div className="flex min-h-36 flex-col rounded-2xl border border-slate-200 bg-white p-3 shadow-card sm:min-h-44 sm:p-5" key={index}>
            <div className="flex items-center gap-2 sm:gap-3">
              <SkeletonBlock className="h-8 w-8 shrink-0 sm:h-10 sm:w-10" />
              <SkeletonBlock className="h-3 w-24 max-w-[60%]" />
            </div>
            <SkeletonBlock className="mt-5 h-8 w-28 max-w-full" />
            <SkeletonBlock className="mt-auto h-6 w-36 max-w-full rounded-full" />
          </div>
        ))}
      </div>
    </>
  );
}

function BillingSkeleton() {
  return (
    <>
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card sm:p-6">
        <div className="flex items-center justify-between gap-4">
          <SkeletonBlock className="h-10 w-40" />
          <SkeletonBlock className="h-8 w-28 rounded-full" />
        </div>
        <SkeletonBlock className="mt-5 h-10 w-48" />
        <div className="mt-5 border-t border-slate-200 pt-4">
          <SkeletonBlock className="h-4 w-20" />
          <SkeletonBlock className="mt-2 h-5 w-36" />
        </div>
      </div>
      <TableSkeleton count={3} />
    </>
  );
}

function ProfileSkeleton() {
  return (
    <>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card sm:p-6">
        <div className="flex items-center gap-4">
          <SkeletonBlock className="h-14 w-14 shrink-0 sm:h-16 sm:w-16" />
          <div className="min-w-0 flex-1">
            <SkeletonBlock className="h-3 w-24" />
            <SkeletonBlock className="mt-3 h-7 w-52 max-w-full" />
            <SkeletonBlock className="mt-2 h-3 w-20" />
          </div>
          <SkeletonBlock className="hidden h-8 w-28 rounded-full sm:block" />
        </div>
      </div>
      <div className="grid items-start gap-4 xl:grid-cols-2">
        {Array.from({ length: 2 }, (_, index) => (
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card sm:p-6" key={index}>
            <SkeletonBlock className="h-3 w-20" />
            <SkeletonBlock className="mt-3 h-6 w-48 max-w-full" />
            <SkeletonBlock className="mt-2 h-3 w-64 max-w-full" />
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {Array.from({ length: index === 0 ? 3 : 2 }, (_, itemIndex) => (
                <SkeletonBlock className="h-[4.625rem] w-full" key={itemIndex} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

export default function LoadingSkeleton({ className = "", count = 3, label = "Loading content", variant = "metrics" }) {
  return (
    <div aria-busy="true" aria-live="polite" className={`space-y-5 sm:space-y-6 ${className}`} data-testid={`loading-skeleton-${variant}`} role="status">
      <span className="sr-only">{label}</span>
      {variant === "billing" && <BillingSkeleton />}
      {variant === "calendar" && <CalendarSkeleton />}
      {variant === "card" && <CardSkeleton />}
      {variant === "chart" && <ChartBodySkeleton />}
      {variant === "chart-panel" && <ChartSkeleton />}
      {variant === "inline" && <InlineSkeleton />}
      {variant === "list" && <ListSkeleton count={count} />}
      {variant === "home-metrics" && <HomeMetricsSkeleton />}
      {variant === "notifications" && <ListSkeleton count={count} />}
      {variant === "profile" && <ProfileSkeleton />}
      {variant === "table" && <TableSkeleton count={count} />}
      {variant === "metrics" && <MetricsSkeleton />}
    </div>
  );
}
