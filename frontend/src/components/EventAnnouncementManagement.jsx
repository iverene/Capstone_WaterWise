import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  CalendarDays,
  CalendarRange,
  ChevronRight,
  CircleAlert,
  Clock3,
  Home,
  MapPin,
  Megaphone,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import AnnouncementForm from "./AnnouncementForm";
import AnnouncementPage from "./AnnouncementPage";
import LoadingSkeleton from "./LoadingSkeleton";
import PageHeader from "./PageHeader";
import { useToast } from "./Toast";
import { createAnnouncement, fetchAnnouncements } from "../services/announcementAPI";
import { fetchEvents } from "../services/eventAPI";

const todayKey = () => new Date().toISOString().slice(0, 10);

function formatDate(value, options = {}) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return value || "Date unavailable";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
    ...options,
  }).format(new Date(`${value}T00:00:00Z`));
}

function formatTime(value) {
  if (!value) return "Time unavailable";
  const [hours, minutes] = value.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return value;
  return new Intl.DateTimeFormat("en-PH", { hour: "numeric", minute: "2-digit" }).format(
    new Date(2000, 0, 1, hours, minutes),
  );
}

function CommunityShortcut({ description, icon: Icon, label, to }) {
  return (
    <Link
      className="group flex min-h-12 items-center gap-3 rounded-xl px-3 py-2 text-navy-900 hover:bg-water-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-water-600"
      to={to}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-water-100 text-water-700 group-hover:bg-water-600 group-hover:text-white">
        <Icon aria-hidden="true" className="h-5 w-5" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-bold">{label}</span>
        <span className="block truncate text-xs text-slate-500">{description}</span>
      </span>
    </Link>
  );
}

function UpcomingEventCard({ event }) {
  const eventDate = new Date(`${event.date}T00:00:00Z`);
  const tags = Array.isArray(event.tags) ? event.tags : [];

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
      <div className="flex items-start gap-3">
        <time
          className="flex w-12 shrink-0 flex-col items-center overflow-hidden rounded-xl border border-water-200 bg-water-50"
          dateTime={event.date}
        >
          <span className="w-full bg-water-600 py-1 text-center text-[10px] font-bold uppercase tracking-wide text-white">
            {new Intl.DateTimeFormat("en-PH", { month: "short", timeZone: "UTC" }).format(eventDate)}
          </span>
          <span className="py-1.5 font-mono text-lg font-extrabold tabular-nums text-water-800">
            {eventDate.getUTCDate()}
          </span>
        </time>
        <div className="min-w-0">
          <h3 className="line-clamp-2 text-sm font-bold leading-5 text-navy-900">{event.title}</h3>
          <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-slate-500">
            <Clock3 aria-hidden="true" className="h-3.5 w-3.5" />
            <span className="font-mono tabular-nums">{formatTime(event.time)}</span>
          </p>
          <p className="mt-1 flex items-start gap-1.5 text-xs text-slate-500">
            <MapPin aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span className="line-clamp-2">{event.location || "Location unavailable"}</span>
          </p>
        </div>
      </div>
      {tags[0] && (
        <span className="mt-3 inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600">
          {tags[0]}
        </span>
      )}
    </article>
  );
}

export default function EventAnnouncementManagement() {
  const toast = useToast();
  const [announcements, setAnnouncements] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadCommunityData = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const [announcementRecords, eventRecords] = await Promise.all([
        fetchAnnouncements(),
        fetchEvents(),
      ]);
      setAnnouncements(announcementRecords);
      setEvents(eventRecords);
    } catch (requestError) {
      setError(
        requestError?.response?.data?.message ??
          requestError.message ??
          "Unable to load community updates.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    const refresh = () =>
      Promise.all([fetchAnnouncements(), fetchEvents()])
        .then(([announcementRecords, eventRecords]) => {
          if (active) {
            setAnnouncements(announcementRecords);
            setEvents(eventRecords);
            setError("");
          }
        })
        .catch((requestError) => {
          if (active) {
            setError(
              requestError?.response?.data?.message ??
                requestError.message ??
                "Unable to load community updates.",
            );
          }
        })
        .finally(() => {
          if (active) setLoading(false);
        });

    refresh();
    const intervalId = window.setInterval(refresh, 15000);
    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, []);

  const upcomingEvents = useMemo(
    () =>
      [...events]
        .filter((event) => event.date >= todayKey())
        .sort((first, second) =>
          `${first.date} ${first.time}`.localeCompare(`${second.date} ${second.time}`),
        )
        .slice(0, 4),
    [events],
  );

  const publishAnnouncement = async (announcement) => {
    try {
      setError("");
      const saved = await createAnnouncement(announcement);
      setAnnouncements((current) => [saved, ...current]);
      toast.success("Announcement published", "The announcement is now visible in all resident portals.");
      return saved;
    } catch (requestError) {
      const validationErrors = requestError?.response?.data?.errors;
      const message = validationErrors
        ? Object.values(validationErrors).join(" ")
        : requestError?.response?.data?.message ?? requestError.message ?? "Unable to publish the announcement.";
      setError(message);
      toast.error("Announcement not published", message);
      return false;
    }
  };

  return (
    <main className="space-y-5 sm:space-y-6">
      <PageHeader description="Publish service updates and keep upcoming barangay activities visible in one familiar feed." title="WaterWise community home" />

      <div className="flex justify-end">
        <button
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60 sm:w-auto"
          disabled={loading}
          onClick={() => loadCommunityData()}
          type="button"
        >
          <RefreshCw aria-hidden="true" className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh feed
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700" role="alert">
          <CircleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <nav className="flex gap-2 overflow-x-auto pb-1 xl:hidden" aria-label="Community shortcuts">
        <Link className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full bg-water-600 px-4 text-sm font-bold text-white" to="/admin/announcements">
          <Megaphone aria-hidden="true" className="h-4 w-4" /> Announcements
        </Link>
        <Link className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border border-slate-300 bg-white px-4 text-sm font-bold text-navy-900" to="/admin/events">
          <CalendarDays aria-hidden="true" className="h-4 w-4" /> Events calendar
        </Link>
      </nav>

      <div className="grid items-start gap-5 xl:grid-cols-[15rem_minmax(0,44rem)_19rem] xl:justify-center">
        <aside className="sticky top-24 hidden space-y-4 xl:block" aria-label="Community navigation">
          <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-card">
            <CommunityShortcut description="Community overview" icon={Home} label="Community home" to="/admin/announcements" />
            <CommunityShortcut description="Publish service notices" icon={Megaphone} label="Announcements" to="/admin/announcements" />
            <CommunityShortcut description="Plan community occasions" icon={CalendarRange} label="Events calendar" to="/admin/events" />
          </section>
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
            <div className="flex items-center gap-2 text-sm font-bold text-navy-900">
              <ShieldCheck aria-hidden="true" className="h-4 w-4 text-emerald-600" />
              Official channel
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-500">
              Posts here are identified as official WaterWise communications in resident portals.
            </p>
          </section>
        </aside>

        <section className="min-w-0 space-y-4" aria-label="Community announcement feed">
          <AnnouncementForm onSubmit={publishAnnouncement} />
          {loading ? (
            <LoadingSkeleton count={3} label="Loading community feed" variant="list" />
          ) : (
            <AnnouncementPage announcements={announcements} />
          )}
        </section>

        <aside className="space-y-4 lg:sticky lg:top-24" aria-labelledby="upcoming-events-heading">
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-water-700">Calendar</p>
                <h2 className="mt-1 text-lg font-extrabold text-navy-900" id="upcoming-events-heading">Upcoming events</h2>
              </div>
              <Link
                aria-label="Open events calendar"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-water-700 hover:bg-water-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-water-600"
                to="/admin/events"
              >
                <ChevronRight aria-hidden="true" className="h-5 w-5" />
              </Link>
            </div>
            <p className="mt-1 text-xs text-slate-500">{formatDate(todayKey(), { weekday: "long" })}</p>
          </section>

          {loading ? (
            <LoadingSkeleton count={2} label="Loading upcoming events" variant="list" />
          ) : upcomingEvents.length ? (
            <div className="space-y-3">
              {upcomingEvents.map((event) => <UpcomingEventCard event={event} key={event.id} />)}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-5 text-center">
              <CalendarDays aria-hidden="true" className="mx-auto h-6 w-6 text-slate-400" />
              <p className="mt-3 text-sm font-bold text-navy-900">No upcoming events</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">New calendar events will appear here.</p>
            </div>
          )}

          <Link
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-navy-900 hover:bg-slate-50"
            to="/admin/events"
          >
            View full calendar
            <ChevronRight aria-hidden="true" className="h-4 w-4" />
          </Link>
        </aside>
      </div>
    </main>
  );
}
