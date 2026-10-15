import { supabase } from "../config/supabase.js";

const EVENT_FIELDS =
  "id, title, description, event_date, event_time, location, tags, status, created_by, created_at, updated_at";
const EVENT_STATUSES = new Set(["Scheduled", "Cancelled"]);

const createError = (message, statusCode = 400) => {
  const error = new TypeError(message);
  error.statusCode = statusCode;
  return error;
};

const parseId = (value) => {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) {
    throw createError("A valid event ID is required.");
  }
  return id;
};

const parseText = (value, fieldName, maximumLength) => {
  if (typeof value !== "string" || !value.trim()) {
    throw createError(`${fieldName} is required.`);
  }
  const normalized = value.trim();
  if (normalized.length > maximumLength) {
    throw createError(`${fieldName} cannot exceed ${maximumLength} characters.`);
  }
  return normalized;
};

const parseDate = (value) => {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    Number.isNaN(Date.parse(`${value}T00:00:00Z`)) ||
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value
  ) {
    throw createError("Event date must use the YYYY-MM-DD format.");
  }
  return value;
};

const parseTime = (value) => {
  if (typeof value !== "string" || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    throw createError("Event time must use the HH:MM 24-hour format.");
  }
  return value;
};

const parseTags = (value) => {
  const tags = Array.isArray(value) ? value : [value];
  const normalized = tags
    .filter((tag) => tag !== null && tag !== undefined && tag !== "")
    .map((tag) => parseText(tag, "Event category", 80));
  if (normalized.length < 1 || normalized.length > 10) {
    throw createError("Provide between 1 and 10 event categories.");
  }
  return [...new Set(normalized)];
};

const parseStatus = (value = "Scheduled") => {
  if (!EVENT_STATUSES.has(value)) {
    throw createError("Event status must be Scheduled or Cancelled.");
  }
  return value;
};

const eventPayload = (event, createdBy) => ({
  title: parseText(event.title, "Event title", 150),
  description: parseText(event.description, "Event description", 2000),
  event_date: parseDate(event.date ?? event.event_date),
  event_time: parseTime(String(event.time ?? event.event_time ?? "").slice(0, 5)),
  location: parseText(event.location, "Event location", 200),
  tags: parseTags(event.tags),
  status: parseStatus(event.status),
  ...(createdBy ? { created_by: createdBy } : {}),
});

const throwDatabaseError = (error, operation) => {
  throw createError(`Failed to ${operation} event: ${error.message}`, 500);
};

export async function getEvents() {
  const { data, error } = await supabase
    .from("events")
    .select(EVENT_FIELDS)
    .order("event_date", { ascending: true })
    .order("event_time", { ascending: true });
  if (error) throwDatabaseError(error, "retrieve");
  return data ?? [];
}

export async function getEventById(value) {
  const id = parseId(value);
  const { data, error } = await supabase
    .from("events")
    .select(EVENT_FIELDS)
    .eq("id", id)
    .maybeSingle();
  if (error) throwDatabaseError(error, "retrieve");
  if (!data) throw createError("Event not found.", 404);
  return data;
}

export async function createEvent(event, createdBy) {
  const { data, error } = await supabase
    .from("events")
    .insert(eventPayload(event, createdBy))
    .select(EVENT_FIELDS)
    .single();
  if (error) throwDatabaseError(error, "create");
  return data;
}

export async function updateEvent(value, event) {
  const id = parseId(value);
  const { data, error } = await supabase
    .from("events")
    .update({ ...eventPayload(event), updated_at: new Date().toISOString() })
    .eq("id", id)
    .select(EVENT_FIELDS)
    .maybeSingle();
  if (error) throwDatabaseError(error, "update");
  if (!data) throw createError("Event not found.", 404);
  return data;
}

export async function deleteEvent(value) {
  const id = parseId(value);
  const { data, error } = await supabase
    .from("events")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) throwDatabaseError(error, "delete");
  if (!data) throw createError("Event not found.", 404);
  return data;
}

const toEventContextItem = (event) => ({
  title: event.title,
  date: event.event_date,
  time: typeof event.event_time === "string" ? event.event_time.slice(0, 5) : event.event_time,
  location: event.location,
  categories: Array.isArray(event.tags) ? event.tags : [],
  status: event.status,
});

export async function getRecommendationEventContext({ years = [], limit = 100 } = {}) {
  let query = supabase
    .from("events")
    .select("id, title, event_date, event_time, location, tags, status")
    .order("event_date", { ascending: true })
    .limit(limit);
  if (Array.isArray(years) && years.length > 0) {
    const numericYears = years.map(Number).filter(Number.isFinite);
    if (numericYears.length > 0) {
      const minYear = Math.min(...numericYears);
      const maxYear = Math.max(...numericYears);
      query = query.gte("event_date", `${minYear}-01-01`).lte("event_date", `${maxYear}-12-31`);
    }
  }
  const { data, error } = await query;
  if (error) throwDatabaseError(error, "retrieve event context");
  return (data ?? []).map(toEventContextItem);
}
