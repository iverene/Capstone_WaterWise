/* eslint-disable react-refresh/only-export-components */
import Filter from "./Filter";

export const ALL_MONTHS_VALUE = "all";

export const MONTH_OPTIONS = [
  { label: "All months", value: ALL_MONTHS_VALUE },
  { label: "January", value: "january" },
  { label: "February", value: "february" },
  { label: "March", value: "march" },
  { label: "April", value: "april" },
  { label: "May", value: "may" },
  { label: "June", value: "june" },
  { label: "July", value: "july" },
  { label: "August", value: "august" },
  { label: "September", value: "september" },
  { label: "October", value: "october" },
  { label: "November", value: "november" },
  { label: "December", value: "december" },
];

/** Year + month (Jan-Dec) filter for the admin dashboard KPIs and trends. */
export default function DashboardPeriodFilter({
  availableYears = [],
  month,
  onMonthChange,
  onYearChange,
  year,
}) {
  const yearOptions = [
    { label: "Latest year", value: "" },
    ...availableYears.map((entry) => ({
      label: String(entry),
      value: String(entry),
    })),
  ];

  return (
    <Filter
      ariaLabel="Filter dashboard by period"
      buttonLabel="Period"
      dataTestId="dashboard-period-filter"
      description="Select which year and month the dashboard KPIs and graphs should show."
      filters={[
        {
          ariaLabel: "Filter dashboard by year",
          dataTestId: "dashboard-year-filter",
          id: "dashboard-year-filter",
          label: "Year",
          name: "dashboardYear",
          onValueChange: onYearChange,
          options: yearOptions,
          value: year ?? "",
        },
        {
          ariaLabel: "Filter dashboard by month",
          dataTestId: "dashboard-month-filter",
          id: "dashboard-month-filter",
          label: "Month",
          name: "dashboardMonth",
          onValueChange: onMonthChange,
          options: MONTH_OPTIONS,
          value: month ?? ALL_MONTHS_VALUE,
        },
      ]}
      title="Dashboard period"
    />
  );
}
