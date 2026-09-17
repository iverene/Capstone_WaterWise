import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock3,
  MapPin,
  Pencil,
  Plus,
  RotateCcw,
  Tag,
  Trash2,
} from "lucide-react";
import EventForm from "../components/EventForm";
import Dropdown from "../components/Dropdown";
import KPI from "../components/KPI";
import LoadingSkeleton from "../components/LoadingSkeleton";
import Modal from "../components/Modal";
import PageHeader from "../components/PageHeader";
import { useToast } from "../components/Toast";
import {
  createEvent as createEventRequest,
  deleteEvent as deleteEventRequest,
  fetchEvents,
  updateEvent as updateEventRequest,
} from "../services/eventAPI";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const pad = (value) => String(value).padStart(2, "0");
const toDateKey = (date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const parseDate = (value) => {
  const [year, month, day] = String(value ?? "").split("-").map(Number);
  return year && month && day ? new Date(year, month - 1, day) : null;
};
const formatFullDate = (value) => {
  const date = typeof value === "string" ? parseDate(value) : value;
  if (!date) return "Date unavailable";
  const weekday = new Intl.DateTimeFormat("en-PH", { weekday: "long" }).format(date);
  const calendarDate = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
  return `${weekday}, ${calendarDate}`;
};
const formatTime = (value) => {
  if (!value) return "Time unavailable";
  const [hours, minutes] = value.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return value;
  return new Intl.DateTimeFormat("en-PH", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(2000, 0, 1, hours, minutes));
};

function getDisplayStatus(event) {
  const todayKey = toDateKey(new Date());
  if (event.status && event.status !== "Scheduled") return event.status;
  if (event.date === todayKey) return "Today";
  if (event.date && event.date < todayKey) return "Past";
  return "Scheduled";
}

function EventStatus({ event }) {
  const status = getDisplayStatus(event);
  const styles = {
    Scheduled: "border-water-200 bg-water-50 text-water-700",
    Today: "border-emerald-200 bg-emerald-50 text-emerald-700",
    Past: "border-slate-200 bg-slate-50 text-slate-600",
    Cancelled: "border-red-200 bg-red-50 text-red-700",
  };
  const Icon = status === "Today" ? CheckCircle2 : status === "Cancelled" ? CircleAlert : Clock3;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${
        styles[status] ?? styles.Scheduled
      }`}
    >
      <Icon aria-hidden="true" className="h-3.5 w-3.5" />
      {status}
    </span>
  );
}

function EventDialog({ defaultDate, event, isOpen, onClose, onSubmit, submitting }) {
  return (
    <Modal
      bodyClassName="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6"
      closeLabel="Close event form"
      description={event ? "Update the information shown on the calendar." : "Add clear schedule information for officials and residents."}
      dismissible={!submitting}
      eyebrow="Community calendar"
      isOpen={isOpen}
      onClose={onClose}
      showCloseButton={false}
      size="md"
      title={event ? "Edit Event" : "Create an Event"}
    >
          <EventForm
            defaultDate={defaultDate}
            initialEvent={event}
            onCancel={onClose}
            onSubmit={onSubmit}
            submitting={submitting}
          />
    </Modal>
  );
}

function EventCard({ event, isConfirmingDelete, onCancelDelete, onDelete, onEdit }) {
  const tags = Array.isArray(event.tags) ? event.tags : [];

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-bold text-navy-900">{event.title}</h3>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600">
            <span className="inline-flex items-center gap-1.5 font-mono tabular-nums">
              <Clock3 aria-hidden="true" className="h-4 w-4 text-water-600" />
              {formatTime(event.time)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <MapPin aria-hidden="true" className="h-4 w-4 text-water-600" />
              {event.location || "Location unavailable"}
            </span>
          </div>
        </div>
        <EventStatus event={event} />
      </div>

      {event.description && <p className="mt-3 text-sm leading-6 text-slate-600">{event.description}</p>}

      {tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2" aria-label="Event categories">
          {tags.map((tag) => (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600"
              key={tag}
            >
              <Tag aria-hidden="true" className="h-3 w-3" />
              {tag}
            </span>
          ))}
        </div>
      )}

      {isConfirmingDelete ? (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3" role="alert">
          <p className="text-sm font-semibold text-red-800">Delete this event permanently?</p>
          <div className="mt-3 flex gap-2">
            <button
              className="min-h-11 flex-1 rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold text-navy-900 hover:bg-slate-50"
              onClick={onCancelDelete}
              type="button"
            >
              Keep event
            </button>
            <button
              className="min-h-11 flex-1 rounded-xl bg-red-600 px-3 text-sm font-bold text-white hover:bg-red-700"
              onClick={onDelete}
              type="button"
            >
              Delete
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex gap-2 border-t border-slate-100 pt-3">
          <button
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-slate-300 px-3 text-sm font-bold text-navy-900 hover:border-water-300 hover:bg-water-50"
            onClick={onEdit}
            type="button"
          >
            <Pencil aria-hidden="true" className="h-4 w-4" />
            Edit
          </button>
          <button
            className="inline-flex min-h-11 w-11 items-center justify-center rounded-xl border border-red-200 text-red-700 hover:bg-red-50"
            aria-label={`Delete ${event.title}`}
            onClick={onDelete}
            type="button"
          >
            <Trash2 aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>
      )}
    </article>
  );
}

export default function EventManagementPage() {
  const toast = useToast();
  const today = useMemo(() => new Date(), []);
  const todayKey = toDateKey(today);
  const [events, setEvents] = useState([]);
  const [currentMonth, setCurrentMonth] = useState(
    () => new Date(today.getFullYear(), today.getMonth(), 1),
  );
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const [dialog, setDialog] = useState({ isOpen: false, event: null, date: todayKey });
  const [deleteConfirmation, setDeleteConfirmation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const loadEvents = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      setEvents(await fetchEvents());
    } catch (requestError) {
      setError(
        requestError?.response?.data?.message ?? requestError.message ?? "Unable to load events.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    const refresh = () =>
      fetchEvents()
        .then((records) => {
          if (active) {
            setEvents(records);
            setError("");
          }
        })
        .catch((requestError) => {
          if (active) {
            setError(
              requestError?.response?.data?.message ??
                requestError.message ??
                "Unable to load events.",
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

  const eventsByDate = useMemo(() => {
    const grouped = new Map();
    events.forEach((event) => {
      if (!grouped.has(event.date)) grouped.set(event.date, []);
      grouped.get(event.date).push(event);
    });
    grouped.forEach((records) => records.sort((first, second) => first.time.localeCompare(second.time)));
    return grouped;
  }, [events]);

  const calendarDays = useMemo(() => {
    const firstDay = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
    const calendarStart = new Date(
      currentMonth.getFullYear(),
      currentMonth.getMonth(),
      1 - firstDay.getDay(),
    );
    return Array.from({ length: 42 }, (_, index) =>
      new Date(calendarStart.getFullYear(), calendarStart.getMonth(), calendarStart.getDate() + index),
    );
  }, [currentMonth]);

  const selectedEvents = eventsByDate.get(selectedDate) ?? [];
  const visibleMonthPrefix = `${currentMonth.getFullYear()}-${pad(currentMonth.getMonth() + 1)}`;
  const monthEventCount = events.filter((event) => event.date?.startsWith(visibleMonthPrefix)).length;
  const nextEvent = [...events]
    .filter((event) => event.date >= todayKey)
    .sort((first, second) => `${first.date} ${first.time}`.localeCompare(`${second.date} ${second.time}`))[0];
  const yearOptions = useMemo(() => {
    const eventYears = events
      .map((event) => Number(String(event.date ?? "").slice(0, 4)))
      .filter(Number.isInteger);
    const currentYear = today.getFullYear();
    const firstYear = Math.min(currentYear - 10, currentMonth.getFullYear(), ...eventYears);
    const lastYear = Math.max(currentYear + 10, currentMonth.getFullYear(), ...eventYears);
    return Array.from({ length: lastYear - firstYear + 1 }, (_, index) => firstYear + index);
  }, [currentMonth, events, today]);

  const openCreateDialog = (date = selectedDate) =>
    setDialog({ isOpen: true, event: null, date: date || todayKey });
  const openEditDialog = (event) =>
    setDialog({ isOpen: true, event, date: event.date || selectedDate });
  const closeDialog = useCallback(() => {
    if (!saving) setDialog((current) => ({ ...current, isOpen: false }));
  }, [saving]);

  const saveEvent = async (event) => {
    const isEditing = Boolean(dialog.event);
    try {
      setSaving(true);
      setError("");
      if (dialog.event) {
        await updateEventRequest(dialog.event.id, { ...dialog.event, ...event });
      } else {
        await createEventRequest({ ...event, status: "Scheduled" });
      }
      setSelectedDate(event.date);
      const savedDate = parseDate(event.date);
      if (savedDate) setCurrentMonth(new Date(savedDate.getFullYear(), savedDate.getMonth(), 1));
      setDialog((current) => ({ ...current, isOpen: false }));
      await loadEvents();
      toast.success(
        isEditing ? "Event updated" : "Event created",
        `${event.title} is scheduled for ${event.date}.`,
      );
      return true;
    } catch (requestError) {
      const message = requestError?.response?.data?.message ?? requestError.message ?? "Unable to save the event.";
      setError(message);
      toast.error(isEditing ? "Event not updated" : "Event not created", message);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const deleteEvent = async (eventId) => {
    const eventTitle = events.find((event) => event.id === eventId)?.title ?? "The event";
    try {
      setError("");
      await deleteEventRequest(eventId);
      setDeleteConfirmation(null);
      await loadEvents();
      toast.success("Event deleted", `${eventTitle} was removed from the calendar.`);
    } catch (requestError) {
      const message = requestError?.response?.data?.message ?? requestError.message ?? "Unable to delete the event.";
      setError(message);
      toast.error("Event not deleted", message);
    }
  };

  const changeMonth = (offset) => {
    const nextMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + offset, 1);
    setCurrentMonth(nextMonth);
    setSelectedDate(toDateKey(nextMonth));
  };

  const returnToToday = () => {
    setCurrentMonth(new Date(today.getFullYear(), today.getMonth(), 1));
    setSelectedDate(todayKey);
  };

  const selectCalendarPeriod = (year, month) => {
    const nextMonth = new Date(year, month, 1);
    setCurrentMonth(nextMonth);
    setSelectedDate(toDateKey(nextMonth));
  };

  return (
    <main className="space-y-5 sm:space-y-6">
      <PageHeader description="Plan fiestas, assemblies, celebrations, and community activities in one calendar." title="Events Calendar" />

      {error && (
        <div
          className="flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 sm:flex-row sm:items-center sm:justify-between"
          role="alert"
        >
          <span className="inline-flex items-start gap-2 font-semibold">
            <CircleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </span>
          <button
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-4 font-bold hover:bg-red-100"
            onClick={loadEvents}
            type="button"
          >
            <RotateCcw aria-hidden="true" className="h-4 w-4" />
            Try again
          </button>
        </div>
      )}

      {loading ? (
        <LoadingSkeleton label="Loading events calendar" variant="calendar" />
      ) : (
        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-3">
          <section className="relative order-1 rounded-2xl border border-slate-200 bg-white shadow-card lg:col-span-2" aria-labelledby="calendar-heading">
            <div className="flex flex-col gap-4 border-b border-slate-200 p-4 sm:flex-row sm:items-end sm:justify-between sm:p-5">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-water-700">
                  Calendar period
                </p>
                <h2 className="sr-only" id="calendar-heading">
                  {MONTH_NAMES[currentMonth.getMonth()]} {currentMonth.getFullYear()}
                </h2>
                <div className="mt-2 flex gap-2">
                  <Dropdown
                    ariaLabel="Select calendar month"
                    className="w-40"
                    onValueChange={(month) =>
                      selectCalendarPeriod(currentMonth.getFullYear(), Number(month))
                    }
                    options={MONTH_NAMES.map((month, index) => ({ label: month, value: index }))}
                    value={currentMonth.getMonth()}
                  />
                  <Dropdown
                    ariaLabel="Select calendar year"
                    className="w-28"
                    onValueChange={(year) =>
                      selectCalendarPeriod(Number(year), currentMonth.getMonth())
                    }
                    options={yearOptions.map((year) => ({ label: String(year), value: year }))}
                    triggerClassName="font-mono tabular-nums"
                    value={currentMonth.getFullYear()}
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  aria-label="Previous month"
                  className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-water-600"
                  onClick={() => changeMonth(-1)}
                  type="button"
                >
                  <ChevronLeft aria-hidden="true" className="h-5 w-5" />
                </button>
                <button
                  className="min-h-11 rounded-xl border border-slate-300 px-4 text-sm font-bold text-navy-900 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-water-600"
                  onClick={returnToToday}
                  type="button"
                >
                  Today
                </button>
                <button
                  aria-label="Next month"
                  className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-water-600"
                  onClick={() => changeMonth(1)}
                  type="button"
                >
                  <ChevronRight aria-hidden="true" className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="overflow-hidden rounded-b-2xl">
              <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50" role="row">
                {DAY_NAMES.map((day) => (
                  <div
                    className="px-1 py-3 text-center text-[11px] font-bold uppercase tracking-wide text-slate-500 sm:text-xs"
                    key={day}
                    role="columnheader"
                  >
                    <span className="sm:hidden">{day[0]}</span>
                    <span className="hidden sm:inline">{day}</span>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7" role="grid">
              {calendarDays.map((date, index) => {
                const key = toDateKey(date);
                const dayEvents = eventsByDate.get(key) ?? [];
                const inCurrentMonth = date.getMonth() === currentMonth.getMonth();
                const selected = key === selectedDate;
                const isToday = key === todayKey;

                return (
                  <div
                    className={`border-b border-slate-100 ${(index + 1) % 7 === 0 ? "" : "border-r"}`}
                    key={key}
                    role="gridcell"
                  >
                    <button
                      aria-label={`${formatFullDate(date)}${dayEvents.length ? `, ${dayEvents.length} events` : ""}`}
                      aria-pressed={selected}
                      className={`h-full min-h-20 w-full p-1.5 text-left transition-colors focus-visible:relative focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-water-600 sm:min-h-32 sm:p-2 ${
                        selected
                          ? "bg-water-50 hover:bg-water-100"
                          : inCurrentMonth
                            ? "bg-white hover:bg-slate-50"
                            : "bg-slate-50/70 hover:bg-slate-100"
                      }`}
                      onClick={() => setSelectedDate(key)}
                      type="button"
                    >
                      <span
                        className={`flex h-8 w-8 items-center justify-center rounded-full font-mono text-xs font-bold tabular-nums sm:text-sm ${
                          isToday
                            ? "bg-water-600 text-white"
                            : selected
                              ? "bg-water-100 text-water-800"
                              : inCurrentMonth
                                ? "text-navy-900"
                                : "text-slate-400"
                        }`}
                      >
                        {date.getDate()}
                      </span>

                      <span className="mt-1 flex flex-wrap gap-1 sm:hidden" aria-hidden="true">
                        {dayEvents.slice(0, 3).map((event) => (
                          <span className="h-1.5 w-1.5 rounded-full bg-water-600" key={event.id} />
                        ))}
                      </span>

                      <span className="mt-1 hidden space-y-1 sm:block" aria-hidden="true">
                        {dayEvents.slice(0, 2).map((event) => (
                          <span
                            className="block min-h-7 w-full truncate rounded-md bg-water-100 px-2 py-1 text-[11px] font-bold text-water-800"
                            key={event.id}
                            title={event.title}
                          >
                            {event.title}
                          </span>
                        ))}
                        {dayEvents.length > 2 && (
                          <span className="block min-h-7 w-full px-2 py-1 text-[11px] font-bold text-slate-500">
                            +{dayEvents.length - 2} more
                          </span>
                        )}
                      </span>
                    </button>
                  </div>
                );
              })}
              </div>
            </div>
          </section>

          <div className="order-2 grid grid-cols-1 items-start gap-5 lg:col-span-1">
          <aside className="h-full rounded-xl border border-slate-200 bg-slate-50 p-3 sm:p-4" aria-labelledby="selected-day-heading">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-water-700">Selected day</p>
                <h2 className="mt-1 text-lg font-extrabold text-navy-900" id="selected-day-heading">
                  {formatFullDate(selectedDate)}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {selectedEvents.length
                    ? `${selectedEvents.length} scheduled ${selectedEvents.length === 1 ? "event" : "events"}`
                    : "No events scheduled"}
                </p>
              </div>
              <button
                aria-label={`Add event on ${formatFullDate(selectedDate)}`}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-water-600 text-white hover:bg-water-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-water-600 focus-visible:ring-offset-2"
                onClick={() => openCreateDialog(selectedDate)}
                type="button"
              >
                <Plus aria-hidden="true" className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {selectedEvents.map((event) => (
                <EventCard
                  event={event}
                  isConfirmingDelete={deleteConfirmation === event.id}
                  key={event.id}
                  onCancelDelete={() => setDeleteConfirmation(null)}
                  onDelete={() =>
                    deleteConfirmation === event.id
                      ? deleteEvent(event.id)
                      : setDeleteConfirmation(event.id)
                  }
                  onEdit={() => openEditDialog(event)}
                />
              ))}

              {selectedEvents.length === 0 && (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center">
                  <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-water-50 text-water-700">
                    <CalendarDays aria-hidden="true" className="h-6 w-6" />
                  </span>
                  <h3 className="mt-4 font-bold text-navy-900">This day is clear</h3>
                  <p className="mt-1 text-sm leading-6 text-slate-500">
                    Add an activity or select another date to review its schedule.
                  </p>
                  <button
                    className="mt-4 min-h-11 rounded-xl bg-water-50 px-4 text-sm font-bold text-water-700 hover:bg-water-100"
                    onClick={() => openCreateDialog(selectedDate)}
                    type="button"
                  >
                    Add event on this day
                  </button>
                </div>
              )}
            </div>
          </aside>
          <div aria-label="Event summary" className="flex h-full flex-col gap-2 sm:gap-3">
            <KPI className="flex-1" compact description="Selected Month" icon={CalendarDays} title="Events This Month" value={monthEventCount} />
            <KPI
              className="flex-1"
              compact
              description={nextEvent ? `${nextEvent.title} · ${formatTime(nextEvent.time)}` : "Add an event to the community calendar"}
              icon={Clock3}
              title="Next Scheduled Event"
              value={nextEvent ? formatFullDate(nextEvent.date) : "None"}
            />
          </div>
          </div>
        </div>
      )}

      <EventDialog
        defaultDate={dialog.date}
        event={dialog.event}
        isOpen={dialog.isOpen}
        onClose={closeDialog}
        onSubmit={saveEvent}
        submitting={saving}
      />
    </main>
  );
}
