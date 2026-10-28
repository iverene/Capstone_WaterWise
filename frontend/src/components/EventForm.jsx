import { useRef, useState } from "react";
import { CalendarDays, Clock3, MapPin, Save, Tag } from "lucide-react";
import Dropdown from "./Dropdown";

const EVENT_CATEGORIES = [
  "Barangay fiesta",
  "Community celebration",
  "Special occasion",
  "Barangay assembly",
  "Sports activity",
  "Health program",
  "Clean-up drive",
  "Religious occasion",
  "Youth activity",
  "Holiday observance",
];

const EVENT_LOCATIONS = [
  "All Puroks",
  "Purok 1",
  "Purok 2",
  "Purok 3",
  "Purok 4",
  "Purok 5",
  "Purok 6",
];

function toTimeInputValue(value = "") {
  const match = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(value);
  if (!match) return value;
  let hours = Number(match[1]);
  const minutes = match[2];
  const meridiem = match[3].toUpperCase();
  if (meridiem === "AM" && hours === 12) hours = 0;
  if (meridiem === "PM" && hours !== 12) hours += 12;
  return `${String(hours).padStart(2, "0")}:${minutes}`;
}

function blockManualPickerEntry(event) {
  const allowedKeys = new Set(["Tab", "Enter", "Escape"]);
  if (allowedKeys.has(event.key) || (event.altKey && event.key === "ArrowDown")) return;
  event.preventDefault();
}

function initialValues(initialEvent, defaultDate) {
  const tags = Array.isArray(initialEvent?.tags)
    ? initialEvent.tags.join(", ")
    : initialEvent?.tags ?? "";
  const category = EVENT_CATEGORIES.includes(tags) ? tags : tags ? "Others" : "";

  return {
    title: initialEvent?.title ?? "",
    description: initialEvent?.description ?? "",
    date: initialEvent?.date ?? defaultDate ?? "",
    time: toTimeInputValue(initialEvent?.time),
    location: EVENT_LOCATIONS.includes(initialEvent?.location) ? initialEvent.location : "",
    category,
    customCategory: category === "Others" ? tags : "",
    tags,
  };
}

export default function EventForm({
  defaultDate = "",
  initialEvent,
  minimumDate = "",
  minimumTime = "",
  onCancel,
  onSubmit,
  submitting = false,
}) {
  const [event, setEvent] = useState(() => initialValues(initialEvent, defaultDate));
  const [errors, setErrors] = useState({});
  const formRef = useRef(null);

  const fieldClass = (name, extra = "") =>
    `mt-2 min-h-12 w-full rounded-xl border bg-white px-4 text-navy-900 outline-none transition-colors placeholder:text-slate-400 focus:ring-4 ${
      errors[name]
        ? "border-red-600 focus:border-red-600 focus:ring-red-100"
        : "border-slate-300 focus:border-water-600 focus:ring-water-100"
    } ${extra}`;
  const labelClass = "text-sm font-bold text-navy-900";

  const handleChange = ({ target }) => {
    setEvent((current) => {
      if (target.name === "category") {
        return {
          ...current,
          category: target.value,
          tags: target.value === "Others" ? current.customCategory : target.value,
        };
      }
      if (target.name === "customCategory") {
        return { ...current, customCategory: target.value, tags: target.value };
      }
      return { ...current, [target.name]: target.value };
    });
    setErrors((current) => ({ ...current, [target.name]: "" }));
  };

  const fieldError = (name) =>
    errors[name] ? (
      <p className="mt-1.5 text-sm font-semibold text-red-700" id={`event-${name}-error`} role="alert">
        {errors[name]}
      </p>
    ) : null;

  const accessibility = (name) => ({
    "aria-describedby": errors[name] ? `event-${name}-error` : undefined,
    "aria-invalid": Boolean(errors[name]),
  });

  const handleSubmit = async (submitEvent) => {
    submitEvent.preventDefault();
    const nextErrors = {};
    if (!event.title.trim()) nextErrors.title = "Enter an event title.";
    if (!event.description.trim()) nextErrors.description = "Add a short description for residents.";
    if (!event.date) nextErrors.date = "Select the event date.";
    else if (minimumDate && event.date < minimumDate) {
      nextErrors.date = "Events can only be scheduled for today or a future date.";
    }
    if (!event.time) nextErrors.time = "Select the event time.";
    else if (event.date === minimumDate && minimumTime && event.time < minimumTime) {
      nextErrors.time = "Select the current Manila time or a later time.";
    }
    if (!event.location.trim()) nextErrors.location = "Enter the event location.";
    if (!event.category) nextErrors.category = "Select an event category.";
    if (event.category === "Others" && !event.customCategory.trim()) {
      nextErrors.customCategory = "Enter a specific category name.";
    }
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length) {
      requestAnimationFrame(() =>
        formRef.current?.querySelector('[aria-invalid="true"]')?.focus(),
      );
      return;
    }

    if (onSubmit) await onSubmit(event);
  };

  return (
    <form className="space-y-6" onSubmit={handleSubmit} ref={formRef}>
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className={labelClass} htmlFor="event-title">Event title</label>
          <input
            {...accessibility("title")}
            autoComplete="off"
            className={fieldClass("title")}
            id="event-title"
            name="title"
            onChange={handleChange}
            placeholder="e.g. Barangay fiesta celebration"
            value={event.title}
          />
          {fieldError("title")}
        </div>

        <div className="sm:col-span-2">
          <label className={labelClass} htmlFor="event-description">Event information</label>
          <textarea
            {...accessibility("description")}
            className={fieldClass("description", "min-h-28 py-3")}
            id="event-description"
            name="description"
            onChange={handleChange}
            placeholder="Explain what will happen and what residents need to prepare."
            rows={4}
            value={event.description}
          />
          {fieldError("description")}
        </div>

        <div>
          <label className={labelClass} htmlFor="event-date">Date</label>
          <div className="relative">
            <CalendarDays aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 mt-1 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              {...accessibility("date")}
              className={fieldClass("date", "pl-11 font-mono tabular-nums")}
              id="event-date"
              min={minimumDate || undefined}
              name="date"
              onChange={handleChange}
              onDrop={(event) => event.preventDefault()}
              onKeyDown={blockManualPickerEntry}
              onPaste={(event) => event.preventDefault()}
              type="date"
              value={event.date}
            />
          </div>
          {fieldError("date")}
        </div>

        <div>
          <label className={labelClass} htmlFor="event-time">Time</label>
          <div className="relative">
            <Clock3 aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 mt-1 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              {...accessibility("time")}
              className={fieldClass("time", "pl-11 font-mono tabular-nums")}
              id="event-time"
              min={event.date === minimumDate ? minimumTime || undefined : undefined}
              name="time"
              onChange={handleChange}
              onDrop={(inputEvent) => inputEvent.preventDefault()}
              onKeyDown={blockManualPickerEntry}
              onPaste={(inputEvent) => inputEvent.preventDefault()}
              type="time"
              value={event.time}
            />
          </div>
          {fieldError("time")}
        </div>

        <div>
          <label className={labelClass} htmlFor="event-location">Location</label>
          <Dropdown
            ariaDescribedBy={accessibility("location")["aria-describedby"]}
            ariaInvalid={accessibility("location")["aria-invalid"]}
            ariaLabel="Select event location"
            className="mt-2"
            icon={MapPin}
            id="event-location"
            name="location"
            onValueChange={(value) => handleChange({ target: { name: "location", value } })}
            options={EVENT_LOCATIONS.map((location) => ({ label: location, value: location }))}
            placeholder="Select purok coverage"
            value={event.location}
          />
          {fieldError("location")}
        </div>

        <div>
          <label className={labelClass} htmlFor="event-category">Category</label>
          <Dropdown
            ariaDescribedBy={accessibility("category")["aria-describedby"]}
            ariaInvalid={accessibility("category")["aria-invalid"]}
            ariaLabel="Select event category"
            className="mt-2"
            icon={Tag}
            id="event-category"
            name="category"
            onValueChange={(value) => handleChange({ target: { name: "category", value } })}
            options={[
              ...EVENT_CATEGORIES.map((category) => ({ label: category, value: category })),
              { label: "Others", value: "Others" },
            ]}
            placeholder="Select category"
            value={event.category}
          />
          {fieldError("category")}

          {event.category === "Others" && (
            <div className="mt-4">
              <label className={labelClass} htmlFor="event-custom-category">
                Specific category
              </label>
              <input
                {...accessibility("customCategory")}
                autoComplete="off"
                className={fieldClass("customCategory")}
                id="event-custom-category"
                name="customCategory"
                onChange={handleChange}
                placeholder="Enter a category"
                value={event.customCategory}
              />
              {fieldError("customCategory")}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:justify-end">
        <button
          className="min-h-11 rounded-xl border border-slate-300 bg-white px-5 font-bold text-navy-900 hover:bg-slate-50 disabled:opacity-60"
          disabled={submitting}
          onClick={onCancel}
          type="button"
        >
          Cancel
        </button>
        <button
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-water-600 px-5 font-bold text-white hover:bg-water-700 disabled:bg-water-300"
          disabled={submitting}
          type="submit"
        >
          <Save aria-hidden="true" className="h-4 w-4" />
          {submitting ? "Saving event…" : initialEvent ? "Save changes" : "Create event"}
        </button>
      </div>
    </form>
  );
}
