import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Droplets, Eye, Gauge, Users } from "lucide-react";
import Filter from "../components/Filter";
import LoadingSkeleton from "../components/LoadingSkeleton";
import KPI from "../components/KPI";
import PageHeader from "../components/PageHeader";
import Search from "../components/Search";
import Table from "../components/Table";
import { fetchConsumerDirectory } from "../services/consumerDirectoryAPI";
import { fetchAdminMeterReadings } from "../services/meterReadingAPI";

const formatMonthLabel = (monthKey) => {
  const date = new Date(`${monthKey}-01T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return monthKey;
  return new Intl.DateTimeFormat("en-PH", { month: "long", year: "numeric", timeZone: "UTC" }).format(date);
};

const currentMonthKey = () => {
  const values = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      month: "2-digit",
      timeZone: "Asia/Manila",
      year: "numeric",
    }).formatToParts(new Date()).map(({ type, value }) => [type, value]),
  );
  return `${values.year}-${values.month}`;
};

export default function AdminReadingsPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [purok, setPurok] = useState("all");
  const [month, setMonth] = useState("");
  const [consumers, setConsumers] = useState([]);
  const [allReadings, setAllReadings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadReadings = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const [directory, readings] = await Promise.all([
        fetchConsumerDirectory(),
        fetchAdminMeterReadings(),
      ]);
      setConsumers(directory);
      setAllReadings(readings);
    } catch (requestError) {
      setError(requestError?.response?.data?.message ?? requestError.message ?? "Unable to load consumption records.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    const refresh = () => Promise.all([
      fetchConsumerDirectory(),
      fetchAdminMeterReadings(),
    ])
      .then(([directory, records]) => {
        if (active) {
          setConsumers(directory);
          setAllReadings(records);
          setError("");
        }
      })
      .catch((requestError) => {
        if (active) setError(requestError?.response?.data?.message ?? requestError.message ?? "Unable to load consumption records.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    refresh();
    const intervalId = window.setInterval(refresh, 15000);
    const handleTargetedRefresh = (event) => {
      if (event.detail?.path === "/admin/readings") void refresh();
    };
    window.addEventListener("waterwise:targeted-refresh", handleTargetedRefresh);
    return () => {
      active = false;
      window.clearInterval(intervalId);
      window.removeEventListener("waterwise:targeted-refresh", handleTargetedRefresh);
    };
  }, []);

  const residentRows = useMemo(() => {
    const readingsByConsumer = new Map();
    allReadings.forEach((reading) => {
      const residentId = String(reading.consumerNo ?? "");
      const current = readingsByConsumer.get(residentId) ?? [];
      current.push(reading);
      readingsByConsumer.set(residentId, current);
    });

    return consumers.map((consumer) => ({
      id: String(consumer.id),
      consumerName: consumer.consumerName,
      consumerNo: consumer.consumerNo,
      purok: consumer.purok,
      readings: [...(readingsByConsumer.get(String(consumer.id)) ?? [])].sort((first, second) =>
        String(second.readingDate ?? "").localeCompare(String(first.readingDate ?? "")) ||
        Number(second.id) - Number(first.id),
      ),
    }));
  }, [allReadings, consumers]);

  const visibleResidents = useMemo(() => {
    const term = query.trim().toLowerCase();
    return residentRows.filter((resident) => {
      const matchesQuery = !term ||
        String(resident.consumerName ?? "").toLowerCase().includes(term);
      return matchesQuery && (purok === "all" || resident.purok === purok);
    });
  }, [purok, query, residentRows]);

  const monthOptions = useMemo(() => [...new Set(
    [currentMonthKey(), ...allReadings
      .map((reading) => String(reading.readingDate ?? "").slice(0, 7))
      .filter((value) => /^\d{4}-\d{2}$/.test(value))],
  )].sort((left, right) => right.localeCompare(left)), [allReadings]);
  const activeMonth = monthOptions.includes(month)
    ? month
    : currentMonthKey();

  const displayedRows = visibleResidents
    .map((resident) => ({
      ...resident,
      readingMonth: activeMonth,
      reading: !activeMonth
        ? null
        : resident.readings.find((item) => String(item.readingDate ?? "").startsWith(activeMonth)) ?? null,
    }))
    .sort((first, second) =>
      String(first.purok ?? "").localeCompare(String(second.purok ?? "")) ||
      String(first.consumerName ?? "").localeCompare(String(second.consumerName ?? "")),
    );

  const recordedRows = displayedRows.filter((row) => row.reading);
  const total = recordedRows.reduce((sum, row) => sum + Number(row.reading.consumption || 0), 0);
  const average = recordedRows.length ? total / recordedRows.length : 0;
  const highest = recordedRows.reduce((maximum, row) => Math.max(maximum, Number(row.reading.consumption || 0)), 0);

  return (
    <main className="min-w-0 space-y-6">
      <PageHeader description={`Review all residents' meter readings for ${formatMonthLabel(activeMonth)}.`} title="Consumption Readings" />

      <section aria-label="Reading summary" className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
        <KPI animateValue compact description="Current Filters" icon={Users} title="Visible Accounts" value={displayedRows.length} />
        <KPI animateValue compact description={formatMonthLabel(activeMonth)} icon={Droplets} title="Total Consumption" unit="m³" value={total.toLocaleString()} />
        <KPI animateValue compact description={`${recordedRows.length} recorded`} icon={Gauge} title="Average Usage" unit="m³" value={average.toFixed(1)} />
        <KPI animateValue compact description="Top Record" icon={Gauge} title="Highest Usage" unit="m³" value={highest.toLocaleString()} />
      </section>

      <div
        aria-label="Meter reading table controls"
        className="flex flex-col gap-3 sm:flex-row sm:items-center"
        role="search"
      >
        <Search ariaLabel="Search consumption readings by consumer name" className="flex-1" onValueChange={setQuery} placeholder="Search consumer name" value={query} />
        <Filter ariaLabel="Filter by purok" className="w-full sm:w-48" onValueChange={setPurok} options={[{ label: "All puroks", value: "all" }, ...[1, 2, 3, 4, 5].map((number) => ({ label: `Purok ${number}`, value: `Purok ${number}` }))]} value={purok} />
        <Filter ariaLabel="Filter by reading month" className="w-full sm:w-48" onValueChange={setMonth} options={monthOptions.map((option) => ({ label: formatMonthLabel(option), value: option }))} value={activeMonth} />
      </div>

      {error && <div className="flex items-center justify-between gap-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert"><span>{error}</span><button className="font-bold underline" onClick={loadReadings} type="button">Try again</button></div>}
      {loading ? (
        <LoadingSkeleton label="Loading meter readings" variant="table" />
      ) : (
        <Table
          ariaLabel="Meter readings"
          columns={[
            { key: "resident", label: "Name" },
            { key: "readingMonth", label: "Reading Month" },
            { key: "previous", label: "Previous Reading", className: "text-center" },
            { key: "current", label: "Present Reading", className: "text-center" },
            { key: "usage", label: "Cubic Used", className: "text-center" },
            { key: "action", label: "Action", className: "text-right" },
          ]}
          data={displayedRows}
          emptyDescription="No residents match the current search or purok filter."
          emptyTitle="No residents found"
          getRowKey={(row) => row.id}
          renderRow={(row) => (
            <>
              <td className="md:px-4 md:py-4">
                <span className="block font-extrabold leading-5 text-navy-900">
                  {row.consumerName}
                </span>
                <span className="mt-0.5 block text-xs font-semibold text-slate-500">
                  {row.purok}
                </span>
              </td>
              <td className="md:px-4 md:py-4 md:text-center">
                <span className="block font-semibold text-slate-700">{formatMonthLabel(row.readingMonth)}</span>
                {!row.reading && <span className="mt-0.5 block text-xs text-slate-500">No reading yet</span>}
              </td>
              <td className="font-mono tabular-nums md:px-4 md:py-4 md:text-center">
                {row.reading ? `${row.reading.previousReading} m³` : "—"}
              </td>
              <td className="font-mono tabular-nums md:px-4 md:py-4 md:text-center">
                {row.reading ? `${row.reading.currentReading} m³` : "—"}
              </td>
              <td className="font-mono font-bold tabular-nums text-navy-900 md:px-4 md:py-4 md:text-center">
                <span className="block">{row.reading ? `${row.reading.consumption} m³` : "—"}</span>
                {row.reading?.readingSource === "incident" && (
                  <span className="mt-1 inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800 ring-1 ring-inset ring-amber-200">
                    includes {row.reading.carriedConsumption} m³ carried
                  </span>
                )}
                {row.reading?.readingSource === "estimated" && (
                  <span className="mt-1 inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600 ring-1 ring-inset ring-slate-200">
                    estimated
                  </span>
                )}
              </td>
              <td className="md:px-4 md:py-4 md:text-right">
                <button
                  aria-label={`View all readings for ${row.consumerName}`}
                  className="inline-flex min-h-11 w-11 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:border-water-300 hover:bg-water-50 hover:text-water-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-water-600"
                  onClick={() => navigate(`/admin/consumer-readings?consumerNo=${encodeURIComponent(row.consumerNo ?? "")}`)}
                  type="button"
                >
                  <Eye aria-hidden="true" className="h-4 w-4" />
                </button>
              </td>
            </>
          )}
        />
      )}
    </main>
  );
}
