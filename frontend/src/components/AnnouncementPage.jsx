import { useEffect, useRef, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Megaphone,
  Pencil,
  Send,
  Trash2,
  TriangleAlert,
  UsersRound,
} from "lucide-react";

const sampleAnnouncements = [
  {
    id: 1,
    title: "Water interruption notice",
    content: "Water service will be temporarily unavailable due to scheduled maintenance.",
    publicationDate: "2026-07-05",
    relatedEvent: "Water Interruption",
  },
];

function displayDate(value) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return value || "Date unavailable";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

const PAGE_SIZE = 10;

export default function AnnouncementPage({
  announcements = sampleAnnouncements,
  layout = "list",
  limit = null,
  paginate = true,
  onEdit,
  onDelete,
  showEndMarker = true,
  showHeader = true,
  title = "Community updates",
}) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [feedKey, setFeedKey] = useState(announcements);
  const sentinelRef = useRef(null);
  if (feedKey !== announcements) {
    setFeedKey(announcements);
    setVisibleCount(PAGE_SIZE);
  }
  const feed = limit ? announcements.slice(0, limit) : announcements;
  const infiniteScroll = !limit && paginate;
  const visibleRows = infiniteScroll ? feed.slice(0, visibleCount) : feed;
  const hasMore = infiniteScroll && visibleCount < feed.length;

  useEffect(() => {
    if (!hasMore) return undefined;
    const sentinel = sentinelRef.current;
    if (!sentinel || typeof IntersectionObserver === "undefined") return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisibleCount((count) => Math.min(count + PAGE_SIZE, feed.length));
        }
      },
      { rootMargin: "400px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [feed.length, hasMore]);
  return (
    <section aria-labelledby={showHeader ? "announcement-feed-heading" : undefined}>
      {showHeader && (
        <div className="mb-4 flex items-end justify-between gap-4 px-1">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-water-700">Latest posts</p>
            <h2 className="mt-1 text-xl font-extrabold text-navy-900" id="announcement-feed-heading">{title}</h2>
          </div>
        </div>
      )}

      {announcements.length === 0 ? (
        <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-water-50 text-water-700">
            <Megaphone aria-hidden="true" className="h-6 w-6" />
          </span>
          <h3 className="mt-4 font-bold text-navy-900">No community updates yet</h3>
          <p className="mt-1 max-w-sm text-sm leading-6 text-slate-500">
            Published announcements will appear here for administrators and residents to review.
          </p>
        </div>
      ) : (
        <div className={layout === "grid" ? "grid items-start gap-4 lg:grid-cols-2" : "space-y-4"}>
          {visibleRows.map((announcement) => (
            <article
              className={`overflow-hidden rounded-2xl border bg-white shadow-card ${
                announcement.priority === "critical"
                  ? "border-red-300"
                  : announcement.priority === "high"
                    ? "border-amber-300"
                    : "border-slate-200"
              }`}
              key={announcement.id}
            >
              <header className="flex items-start gap-3 p-4 pb-3 sm:p-5 sm:pb-3">
                <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white ${
                  announcement.priority === "critical"
                    ? "bg-red-600"
                    : announcement.priority === "high"
                      ? "bg-amber-500"
                      : "bg-water-600"
                }`}>
                  {announcement.priority === "critical"
                    ? <TriangleAlert aria-hidden="true" className="h-5 w-5" />
                    : <Megaphone aria-hidden="true" className="h-5 w-5" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-bold text-sm text-navy-900 sm:text-base">WaterWise Administration</p>
                      <p className="mt-0.5 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                        <CalendarDays aria-hidden="true" className="h-3.5 w-3.5" />
                        <span className="font-mono tabular-nums">{displayDate(announcement.publicationDate)}</span>
                      </p>
                    </div>
                    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${
                      announcement.priority === "critical"
                        ? "border-red-200 bg-red-50 text-red-700"
                        : "border-water-200 bg-water-50 text-water-700"
                    }`}>
                      {announcement.priority === "critical"
                        ? <TriangleAlert aria-hidden="true" className="h-3.5 w-3.5" />
                        : <CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5" />}
                      {announcement.priority === "critical" ? "Urgent" : "Published"}
                    </span>
                  </div>
                </div>
              </header>

              <div className="px-4 pb-4 sm:px-5 sm:pb-5">
                <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">
                  {announcement.relatedEvent || "General Announcement"}
                </span>
                <h3 className="mt-3 text-base font-extrabold text-navy-900 sm:text-xl">{announcement.title}</h3>
                <p className="mt-2 whitespace-pre-line text-xs leading-5 text-slate-600 sm:text-sm sm:leading-6">
                  {announcement.content}
                </p>
              </div>

              <footer className="flex flex-col gap-3 border-t border-slate-100 bg-slate-50/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <span className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500">
                  <UsersRound aria-hidden="true" className="h-4 w-4 text-water-700" />
                  Visible to all resident portals
                </span>
                {(onEdit || onDelete) && (
                  <div className="flex gap-2">
                    {onEdit && (
                      <button
                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-sm font-bold text-water-700 hover:bg-water-50"
                        onClick={() => onEdit(announcement)}
                        type="button"
                      >
                        <Pencil aria-hidden="true" className="h-4 w-4" />
                        Edit
                      </button>
                    )}
                    {onDelete && (
                      <button
                        aria-label={`Delete ${announcement.title}`}
                        className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-red-700 hover:bg-red-50"
                        onClick={() => onDelete(announcement.id)}
                        type="button"
                      >
                        <Trash2 aria-hidden="true" className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                )}
              </footer>
            </article>
          ))}
        </div>
      )}

      {hasMore && <div aria-hidden="true" className="h-1" ref={sentinelRef} />}

      {hasMore && (
        <button
          className="mx-auto flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-5 text-sm font-bold text-water-700 hover:border-water-300 hover:bg-water-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-water-600"
          onClick={() => setVisibleCount((count) => Math.min(count + PAGE_SIZE, feed.length))}
          type="button"
        >
          <ChevronDown aria-hidden="true" className="h-4 w-4" />
          Load older posts
        </button>
      )}

      {showEndMarker && announcements.length > 0 && !hasMore && (
        <div className="mt-4 flex items-center justify-center gap-2 py-2 text-xs font-semibold text-slate-400">
          <Send aria-hidden="true" className="h-3.5 w-3.5" />
          End of published updates
        </div>
      )}
    </section>
  );
}
