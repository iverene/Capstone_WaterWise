import { useEffect, useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Filter from "../components/Filter";
import MeterReadingTable from "../components/MeterReadingTable";
import LoadingSkeleton from "../components/LoadingSkeleton";
import PageHeader from "../components/PageHeader";
import { fetchAdminMeterReadings } from "../services/meterReadingAPI";

export default function ConsumerReadingsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const consumerNo = searchParams.get("consumerNo") ?? "";
  const [readings, setReadings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [year, setYear] = useState("");

  useEffect(() => {
    let active = true;
    fetchAdminMeterReadings()
      .then((records) => {
        if (active) setReadings(records);
      })
      .catch((requestError) => {
        if (active) setError(requestError.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const consumerReadings = useMemo(() => readings
    .filter((reading) => String(reading.consumerNo ?? "") === consumerNo)
    .sort((first, second) =>
      String(second.readingDate ?? "").localeCompare(String(first.readingDate ?? "")) ||
      Number(second.id) - Number(first.id),
    ), [consumerNo, readings]);
  const consumer = consumerReadings[0] ?? null;
  const yearOptions = useMemo(() => [...new Set(
    consumerReadings
      .map((reading) => String(reading.readingDate ?? "").slice(0, 4))
      .filter((value) => /^\d{4}$/.test(value)),
  )].sort((left, right) => right.localeCompare(left)), [consumerReadings]);
  const activeYear = yearOptions.includes(year) ? year : yearOptions[0] ?? "";
  const filteredReadings = activeYear
    ? consumerReadings.filter((reading) => String(reading.readingDate ?? "").startsWith(activeYear))
    : consumerReadings;

  return (
    <main className="min-w-0 space-y-6">
      <button
        className="inline-flex min-h-10 items-center gap-2 rounded-xl px-2 text-xs font-bold text-water-700 hover:bg-water-50 hover:text-water-900"
        onClick={() => navigate("/admin/readings")}
        type="button"
      >
        <ArrowLeft aria-hidden="true" className="h-4 w-4" />
        Back to readings
      </button>
      <div>
        <PageHeader title={consumer?.consumerName ?? "Consumer Readings"} />
        {consumer && (
          <p className="mt-1 text-sm text-slate-500">
            {consumer.purok ?? "Unassigned"}
          </p>
        )}
      </div>

      {error && <div className="flex items-center justify-between gap-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert"><span>{error}</span><button className="font-bold underline" onClick={() => window.location.reload()} type="button">Try again</button></div>}
      {!loading && yearOptions.length > 0 && (
        <div className="flex justify-end">
          <Filter
            ariaLabel="Filter readings by year"
            className="w-full sm:w-32"
            onValueChange={setYear}
            options={yearOptions.map((option) => ({ label: option, value: option }))}
            value={activeYear}
          />
        </div>
      )}
      {loading ? (
        <LoadingSkeleton label="Loading consumer readings" variant="table" />
      ) : (
        <MeterReadingTable
          pageSize={12}
          readOnly
          readingDateFirst
          readings={filteredReadings}
          showConsumerDetails={false}
          showStatus={false}
        />
      )}
    </main>
  );
}
