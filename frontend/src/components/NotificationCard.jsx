import { FiTrash2 } from "react-icons/fi";
import { getNotificationPresentation } from "../utils/notificationPresentation";

const formatNotificationDate = (value) => {
  if (!value) return "";
  const includesTime = String(value).includes("T");
  const date = new Date(includesTime ? value : `${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-PH", {
    day: "numeric",
    ...(includesTime ? { hour: "numeric", minute: "2-digit" } : {}),
    month: "short",
    timeZone: includesTime ? "Asia/Manila" : "UTC",
    year: "numeric",
  }).format(date);
};

export default function NotificationCard({ item, onDelete, onMarkAsRead, onNotificationClick }) {
  if (!item) return null;

  const handleClick = () => {
    if (!item.isRead) onMarkAsRead?.(item.id);
    onNotificationClick?.(item);
  };

  const isCritical = item.priority === "critical";
  const isHighPriority = item.priority === "high";
  const { Icon, label: iconLabel } = getNotificationPresentation(item);
  const unreadSurface = isCritical
    ? "bg-red-50 text-slate-900 hover:bg-red-100/70"
    : isHighPriority
      ? "bg-amber-50 text-slate-900 hover:bg-amber-100/70"
      : "bg-water-50 text-slate-900 hover:bg-water-100/70";
  const unreadIcon = isCritical
    ? "bg-red-600 text-white"
    : isHighPriority
      ? "bg-amber-500 text-white"
      : "bg-water-600 text-white";

  return (
    <article
      className={`relative rounded-xl transition-colors ${item.isRead ? "text-slate-600 hover:bg-slate-50" : unreadSurface}`}
      data-id={item.id}
      data-is-read={item.isRead}
      data-testid={`notification-card-${item.id}`}
    >
      <button
        className={`flex min-h-[4.25rem] w-full items-start gap-3 rounded-xl p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-water-600 ${onDelete ? "pr-12" : ""}`}
        onClick={handleClick}
        type="button"
      >
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${item.isRead ? "bg-slate-100 text-slate-500" : unreadIcon}`}>
          <Icon aria-hidden="true" className="h-[1.125rem] w-[1.125rem]" />
          <span className="sr-only">{iconLabel}</span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-start justify-between gap-2">
            <span className="text-[13px] font-bold leading-5 text-navy-900 sm:text-sm sm:leading-5">
              {item.title}
              {isCritical && (
                <span className="ml-2 inline-flex rounded-full bg-red-100 px-2 py-0.5 align-middle text-[10px] font-extrabold uppercase tracking-wide text-red-700">
                  Urgent
                </span>
              )}
            </span>
            {!item.isRead && <span aria-hidden="true" className="mt-1 h-[0.5625rem] w-[0.5625rem] shrink-0 rounded-full bg-water-600" />}
            {!item.isRead && <span className="sr-only">Unread</span>}
          </span>
          <span className="mt-1 line-clamp-3 block text-[13px] font-normal leading-5 text-slate-600 sm:text-sm sm:leading-5">{item.message}</span>
          {(item.createdAt || item.date) && <span className={`mt-1.5 block text-xs font-semibold ${item.isRead ? "text-slate-400" : "text-water-700"}`}>{formatNotificationDate(item.createdAt ?? item.date)}</span>}
        </span>
      </button>
      {onDelete && (
        <button
          aria-label={`Delete ${item.title}`}
          className="absolute right-1 top-1 flex h-11 w-11 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-red-50 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
          onClick={() => onDelete(item.id)}
          title="Delete notification"
          type="button"
        >
          <FiTrash2 aria-hidden="true" className="h-4 w-4" />
        </button>
      )}
    </article>
  );
}
