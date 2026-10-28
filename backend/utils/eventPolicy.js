import { currentManilaDate } from "./billingPolicy.js";

export const EVENT_LOCATIONS = Object.freeze([
  "All Puroks",
  "Purok 1",
  "Purok 2",
  "Purok 3",
  "Purok 4",
  "Purok 5",
  "Purok 6",
]);

export const isAllowedEventLocation = (location) => EVENT_LOCATIONS.includes(location);

export function currentManilaTime(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      hourCycle: "h23",
      minute: "2-digit",
      timeZone: "Asia/Manila",
    }).formatToParts(now).map(({ type, value }) => [type, value]),
  );
  return `${parts.hour}:${parts.minute}`;
}

export const isPastEventDate = (eventDate, today = currentManilaDate()) =>
  String(eventDate) < String(today);

export const isPastEventSchedule = (
  eventDate,
  eventTime,
  today = currentManilaDate(),
  currentTime = currentManilaTime(),
) => eventDate < today || (eventDate === today && eventTime < currentTime);

export const hasEventStarted = (
  eventDate,
  eventTime,
  today = currentManilaDate(),
  currentTime = currentManilaTime(),
) => eventDate < today || (eventDate === today && eventTime <= currentTime);

export const eventAppliesToPurok = (eventLocation, purok) =>
  eventLocation === "All Puroks" || eventLocation === purok;
