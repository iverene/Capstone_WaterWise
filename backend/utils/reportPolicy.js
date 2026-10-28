export function reportDateRangeError({ endDate, maxDate, minDate, startDate }) {
  if (startDate < minDate) {
    return `Start date cannot be earlier than the first available record (${minDate}).`;
  }
  if (endDate > maxDate) {
    return `End date cannot be later than the current Manila date (${maxDate}).`;
  }
  if (endDate < startDate) {
    return "The end date must be on or after the start date.";
  }
  return null;
}
