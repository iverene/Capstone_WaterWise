import { useEffect, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import LoadingSkeleton from "../components/LoadingSkeleton";
import NotificationCard from "../components/NotificationCard";

const PAGE_SIZE = 10;

export default function NotificationPage({
  isLoading = false,
  notifications = [],
  onDelete,
  onMarkAsRead,
  onNotificationClick,
  isSelectionMode = false,
  selectedIds = new Set(),
  onLongPressStart,
  onLongPressEnd,
  onToggleSelection,
}) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef(null);

  const unifiedNotifications = [...notifications].sort((left, right) => {
    const dateComparison = String(right.date ?? "").localeCompare(String(left.date ?? ""));
    return dateComparison || Number(right.id) - Number(left.id);
  });

  const hasMore = visibleCount < unifiedNotifications.length;
  const visible = unifiedNotifications.slice(0, visibleCount);

  useEffect(() => {
    if (!hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, unifiedNotifications.length));
        }
      },
      { threshold: 0.1 }
    );
    const node = sentinelRef.current;
    if (node) observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, unifiedNotifications.length]);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-2" data-testid="notification-hub-page">
      {isLoading ? (
        <LoadingSkeleton className="p-2" count={4} label="Loading notifications" variant="notifications" />
      ) : unifiedNotifications.length === 0 ? (
        <div className="flex min-h-56 flex-col items-center justify-center px-6 text-center">
          <p className="font-bold text-navy-900">You're all caught up</p>
          <p className="mt-1 text-sm leading-6 text-slate-500">New billing updates and community announcements will appear here.</p>
        </div>
      ) : (
        <div className="grid gap-1">
          {visible.map((notification) => (
            <NotificationCard
              item={notification}
              key={notification.id}
              onDelete={onDelete}
              onMarkAsRead={onMarkAsRead}
              onNotificationClick={onNotificationClick}
              isSelectionMode={isSelectionMode}
              isSelected={selectedIds.has(notification.id)}
              onLongPressStart={onLongPressStart}
              onLongPressEnd={onLongPressEnd}
              onToggleSelection={onToggleSelection}
            />
          ))}
          {hasMore && (
            <div ref={sentinelRef} className="flex items-center justify-center py-3">
              <LoaderCircle className="h-5 w-5 animate-spin text-water-600" />
            </div>
          )}
          {!hasMore && unifiedNotifications.length > PAGE_SIZE && (
            <p className="py-3 text-center text-xs text-slate-400">All notifications loaded</p>
          )}
        </div>
      )}
    </div>
  );
}
