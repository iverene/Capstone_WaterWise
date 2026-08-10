import { useCallback, useEffect, useMemo, useState } from "react";
import { Droplets, Eye, Gauge, Users } from "lucide-react";
import MeterReadingTable from "../components/MeterReadingTable";
import Filter from "../components/Filter";
import LoadingSkeleton from "../components/LoadingSkeleton";
import KPI from "../components/KPI";
import Modal from "../components/Modal";
import PageHeader from "../components/PageHeader";
import Search from "../components/Search";
import Table from "../components/Table";
import { fetchAdminMeterReadings } from "../services/meterReadingAPI";

export default function AdminReadingsPage() {
  const [query, setQuery] = useState("");
  const [purok, setPurok] = useState("all");
  const [allReadings, setAllReadings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedResident, setSelectedResident] = useState(null);

  const loadReadings = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      setAllReadings(await fetchAdminMeterReadings());
    } catch (requestError) {
      setError(requestError?.response?.data?.message ?? requestError.message ?? "Unable to load consumption records.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    const refresh = () => fetchAdminMeterReadings()
      .then((records) => {
        if (active) setAllReadings(records);
      })
      .catch((requestError) => {
        if (active) setError(requestError?.response?.data?.message ?? requestError.message ?? "Unable to load consumption records.");
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

  const residentRows = useMemo(() => {
    const groups = new Map();
    allReadings.forEach((reading) => {
      const residentId = String(reading.consumerNo ?? reading.consumerName);
      const current = groups.get(residentId) ?? [];
      current.push(reading);
      groups.set(residentId, current);
    });

    return Array.from(groups.entries()).map(([id, residentReadings]) => ({
      id,
      consumerName: residentReadings[0].consumerName,
      consumerNo: residentReadings[0].consumerNo,
      purok: residentReadings[0].purok,
      readings: [...residentReadings].sort((first, second) =>
        String(second.readingDate ?? "").localeCompare(String(first.readingDate ?? "")) ||
        Number(second.id) - Number(first.id),
      ),
    }));
  }, [allReadings]);

  const visibleResidents = useMemo(() => {
    const term = query.trim().toLowerCase();
    return residentRows.filter((resident) => {
      const matchesQuery = !term ||
        [resident.consumerNo, resident.consumerName, resident.purok].some((value) =>
          String(value).toLowerCase().includes(term),
        );
      return matchesQuery && (purok === "all" || resident.purok === purok);
    });
  }, [purok, query, residentRows]);

  const visibleReadings = visibleResidents.flatMap((resident) => resident.readings);

  const total = visibleReadings.reduce((sum, reading) => sum + Number(reading.consumption || 0), 0);
  const average = visibleReadings.length ? total / visibleReadings.length : 0;
  const highest = visibleReadings.reduce((maximum, reading) => Math.max(maximum, Number(reading.consumption || 0)), 0);

  return (
    <main className="min-w-0 space-y-6">
      <PageHeader description="Review meter movements and recorded water use across every purok." eyebrow="Read-only records" title="Consumer consumption readings" />

      <section aria-label="Reading summary" className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
        <KPI description="Matches the current filters" icon={Users} title="Visible accounts" value={visibleResidents.length} />
        <KPI description="Across visible records" icon={Droplets} title="Total consumption" unit="m³" value={total.toLocaleString()} />
        <KPI description="Per visible reading" icon={Gauge} title="Average usage" unit="m³" value={average.toFixed(1)} />
        <KPI description="Highest visible record" icon={Gauge} title="Highest usage" unit="m³" value={highest.toLocaleString()} />
      </section>

      <div
        aria-label="Meter reading table controls"
        className="flex flex-col gap-3 sm:flex-row sm:items-center"
        role="search"
      >
        <Search ariaLabel="Search consumption readings" className="flex-1" onValueChange={setQuery} placeholder="Search consumer number, name, or purok" value={query} />
        <Filter ariaLabel="Filter by purok" className="w-full sm:w-48" onValueChange={setPurok} options={[{ label: "All puroks", value: "all" }, ...[1, 2, 3, 4, 5].map((number) => ({ label: `Purok ${number}`, value: `Purok ${number}` }))]} value={purok} />
      </div>

      {error && <div className="flex items-center justify-between gap-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert"><span>{error}</span><button className="font-bold underline" onClick={loadReadings} type="button">Try again</button></div>}
      {loading ? (
        <LoadingSkeleton label="Loading meter readings" variant="table" />
      ) : (
        <Table
          ariaLabel="Resident reading accounts"
          columns={[
            { key: "account", label: "Account" },
            { key: "resident", label: "Name" },
            { key: "purok", label: "Purok" },
            { key: "action", label: "Action", className: "text-right" },
          ]}
          data={visibleResidents}
          emptyDescription="Residents will appear here when meter readings are recorded."
          emptyTitle="No resident readings found"
          getRowKey={(resident) => resident.id}
          rowClassName="grid grid-cols-2 gap-x-3 gap-y-2 p-4 transition-colors hover:bg-slate-50 md:table-row md:p-0"
          tableClassName="block w-full text-left text-sm md:table"
          renderRow={(resident) => (
            <>
              <td className="px-4 py-4 font-mono text-navy-900">{resident.consumerNo}</td>
              <td className="px-4 py-4 font-extrabold text-navy-900">
                {resident.consumerName}
              </td>
              <td className="px-4 py-4 text-slate-600">{resident.purok}</td>
              <td className="flex flex-col items-stretch justify-end md:table-cell md:px-4 md:py-4 md:text-right">
                <button
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-water-50 px-3 font-bold text-water-700 hover:bg-water-100 md:w-auto md:px-4"
                  onClick={() => setSelectedResident(resident)}
                  type="button"
                >
                  <Eye aria-hidden="true" className="h-4 w-4" />
                  View readings
                </button>
              </td>
            </>
          )}
        />
      )}

      <Modal
        closeLabel="Close resident readings"
        description={`${selectedResident?.readings.length ?? 0} meter reading records for this resident.`}
        eyebrow="Resident reading history"
        isOpen={Boolean(selectedResident)}
        onClose={() => setSelectedResident(null)}
        size="xl"
        title={selectedResident?.consumerName}
      >
        <div className="p-4 sm:p-6">
          <MeterReadingTable
            readOnly
            readingDateFirst
            readings={selectedResident?.readings ?? []}
            showConsumerDetails={false}
            showUsage={false}
          />
        </div>
      </Modal>
    </main>
  );
}
