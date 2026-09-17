import { Droplets } from "lucide-react";
import { useMemo } from "react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import ChartTooltip from "./ChartTooltip";
import Filter from "./Filter";

const shortMonthFormatter = new Intl.DateTimeFormat("en-PH", {
  month: "short",
  timeZone: "UTC",
});

function getConsumption(record) {
  if (
    typeof record.currentReading === "number" &&
    typeof record.previousReading === "number"
  ) {
    return Number((record.currentReading - record.previousReading).toFixed(1));
  }
  return Number(record.volume ?? record.consumption ?? 0);
}

function normalizeTrendRecord(record) {
  const consumption = getConsumption(record);
  const date = record.readingDate
    ? new Date(`${record.readingDate}T00:00:00Z`)
    : null;
  const year = String(record.year ?? record.readingDate?.slice(0, 4) ?? "");
  return {
    ...record,
    consumption,
    year,
    shortMonth: date && !Number.isNaN(date.getTime())
      ? shortMonthFormatter.format(date)
      : String(record.month ?? "").slice(0, 3),
  };
}

function UsageTooltip({ active, payload }) {
  return (
    <ChartTooltip
      active={active}
      labelFormatter={(_, record) => record.month}
      payload={payload}
      supportingFormatter={(record) =>
        typeof record.previousReading === "number" && typeof record.currentReading === "number"
          ? `Meter: ${record.previousReading.toLocaleString()} to ${record.currentReading.toLocaleString()} m³`
          : null
      }
      valueFormatter={(amount) => Number(amount).toLocaleString("en-PH", { maximumFractionDigits: 1 })}
      valueLabel="used"
    />
  );
}

function YearTooltip({ active, payload }) {
  return (
    <ChartTooltip
      active={active}
      labelFormatter={(_, record) => record.year}
      payload={payload}
      valueFormatter={(amount) => Number(amount).toLocaleString("en-PH", { maximumFractionDigits: 1 })}
      valueLabel="used"
    />
  );
}

function EmptyChart({ message, title }) {
  return (
    <div className="flex min-h-60 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6">
      <div className="text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-water-50 text-water-700">
          <Droplets aria-hidden="true" className="h-5 w-5" />
        </span>
        <h3 className="mt-4 font-bold text-navy-900">{title}</h3>
        <p className="mx-auto mt-1 max-w-sm text-sm leading-6 text-slate-500">{message}</p>
      </div>
    </div>
  );
}

export function ConsumerMonthlyConsumptionChart({
  activeYear = "all",
  onYearChange,
  trendData = [],
  yearOptions = [],
}) {
  const normalizedData = useMemo(
    () => trendData.map((record) => {
      const normalizedRecord = normalizeTrendRecord(record);
      return {
        ...normalizedRecord,
        axisLabel: activeYear === "all" && normalizedRecord.year
          ? `${normalizedRecord.shortMonth} '${normalizedRecord.year.slice(-2)}`
          : normalizedRecord.shortMonth,
      };
    }),
    [activeYear, trendData],
  );
  const filterOptions = useMemo(
    () => yearOptions.map((year) => ({ label: year, value: year })),
    [yearOptions],
  );

  return (
    <section
      className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5"
      data-testid="consumer-monthly-consumption-chart"
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="min-w-0 flex-1 text-[15px] font-extrabold tracking-tight text-navy-900">
          Monthly Consumption
        </h2>
        <Filter
          ariaLabel="Filter monthly consumption by year"
          className="w-32 shrink-0"
          compact
          name="monthly-year"
          onValueChange={onYearChange}
          options={filterOptions}
          value={activeYear}
        />
      </div>

      {normalizedData.length ? (
        <div
          aria-label="Line chart of monthly water consumption."
          className="h-60"
          role="img"
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart accessibilityLayer data={normalizedData} margin={{ bottom: 0, left: 0, right: 8, top: 10 }}>
              <defs>
                <linearGradient id="consumerMonthlyFill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#0284C7" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#0284C7" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <XAxis
                axisLine={false}
                dataKey="axisLabel"
                interval="preserveStartEnd"
                minTickGap={20}
                tick={{ fill: "#64748b", fontSize: 12 }}
                tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                axisLine={false}
                domain={[0, "auto"]}
                tick={{ fill: "#64748b", fontSize: 11 }}
                tickLine={false}
                width={44}
              />
              <Tooltip content={<UsageTooltip />} cursor={{ stroke: "#bae6fd" }} />
              <Area
                activeDot={{ fill: "#0284C7", r: 5, stroke: "#ffffff", strokeWidth: 2 }}
                connectNulls={false}
                dataKey="consumption"
                dot={{ fill: "#0284C7", r: 3, stroke: "#ffffff", strokeWidth: 2 }}
                fill="url(#consumerMonthlyFill)"
                name="Water used"
                stroke="#0284C7"
                strokeWidth={2.5}
                type="monotone"
              />
            </AreaChart>
          </ResponsiveContainer>
          <p className="sr-only">
            The solid teal line shows recorded monthly consumption.
          </p>
        </div>
      ) : (
        <EmptyChart
          message="Your monthly trend will appear after the first meter reading is recorded."
          title="No monthly data available"
        />
      )}
    </section>
  );
}

export function ConsumerYearlyConsumptionChart({ trendData = [] }) {
  const yearlyData = useMemo(() => {
    const totals = new Map();
    trendData.forEach((record) => {
      const normalized = normalizeTrendRecord(record);
      if (!normalized.year) return;
      totals.set(normalized.year, (totals.get(normalized.year) ?? 0) + normalized.consumption);
    });
    return [...totals.entries()]
      .map(([year, consumption]) => ({ consumption: Number(consumption.toFixed(1)), year }))
      .sort((first, second) => first.year.localeCompare(second.year));
  }, [trendData]);

  return (
    <section
      className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5"
      data-testid="consumer-yearly-consumption-chart"
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="min-w-0 flex-1 text-[15px] font-extrabold tracking-tight text-navy-900">
          Yearly Consumption
        </h2>
      </div>

      {yearlyData.length ? (
        <div
          aria-label="Line chart of yearly water consumption."
          className="h-60"
          role="img"
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart accessibilityLayer data={yearlyData} margin={{ bottom: 0, left: 0, right: 8, top: 10 }}>
              <defs>
                <linearGradient id="consumerYearlyFill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#0284C7" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#0284C7" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <XAxis
                axisLine={false}
                dataKey="year"
                tick={{ fill: "#64748b", fontSize: 12 }}
                tickLine={false}
              />
              <YAxis
                axisLine={false}
                tick={{ fill: "#64748b", fontSize: 11 }}
                tickFormatter={(value) => Number(value).toLocaleString("en-PH", { maximumFractionDigits: 0 })}
                tickLine={false}
                width={44}
              />
              <Tooltip content={<YearTooltip />} cursor={{ stroke: "#bae6fd" }} />
              <Area
                activeDot={{ fill: "#0284C7", r: 5, stroke: "#ffffff", strokeWidth: 2 }}
                connectNulls={false}
                dataKey="consumption"
                dot={{ fill: "#0284C7", r: 3, stroke: "#ffffff", strokeWidth: 2 }}
                fill="url(#consumerYearlyFill)"
                name="Water used"
                stroke="#0284C7"
                strokeWidth={2.5}
                type="monotone"
              />
            </AreaChart>
          </ResponsiveContainer>
          <p className="sr-only">
            The solid teal line shows recorded yearly consumption.
          </p>
        </div>
      ) : (
        <EmptyChart
          message="Your yearly trend will appear after the first meter reading is recorded."
          title="No yearly data available"
        />
      )}
    </section>
  );
}
