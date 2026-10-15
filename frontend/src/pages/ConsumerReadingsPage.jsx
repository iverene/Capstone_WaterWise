import { useEffect, useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import ConsumptionReceiptModal from "../components/ConsumptionReceiptModal";
import Filter from "../components/Filter";
import MeterReadingTable from "../components/MeterReadingTable";
import LoadingSkeleton from "../components/LoadingSkeleton";
import PageHeader from "../components/PageHeader";
import { useToast } from "../components/Toast";
import { fetchBillingHistory } from "../services/billingAPI";
import { fetchAdminMeterReadings } from "../services/meterReadingAPI";

const formatReceiptDate = (value) => {
  if (!value) return "Not available";
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: String(value).includes("T") ? "short" : undefined,
    timeZone: String(value).includes("T") ? "Asia/Manila" : "UTC",
  }).format(date);
};

export default function ConsumerReadingsPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [searchParams] = useSearchParams();
  const consumerNo = searchParams.get("consumerNo") ?? "";
  const [readings, setReadings] = useState([]);
  const [billings, setBillings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [year, setYear] = useState("");
  const [selectedReading, setSelectedReading] = useState(null);
  const [receiptView, setReceiptView] = useState(null);

  useEffect(() => {
    let active = true;
    Promise.all([fetchAdminMeterReadings(), fetchBillingHistory()])
      .then(([meterRecords, billingRecords]) => {
        if (active) {
          setReadings(meterRecords);
          setBillings(billingRecords);
        }
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
  const consumerBillings = useMemo(() => billings
    .filter((billing) => String(billing.raw?.user_id ?? "") === consumerNo)
    .sort((first, second) =>
      String(second.raw?.billing_date ?? "").localeCompare(String(first.raw?.billing_date ?? "")) ||
      Number(second.id) - Number(first.id),
    ), [billings, consumerNo]);
  const billByConsumptionId = useMemo(() => {
    const map = new Map();
    consumerBillings.forEach((billing) => {
      if (billing.raw?.consumption_id != null) map.set(Number(billing.raw.consumption_id), billing);
    });
    return map;
  }, [consumerBillings]);
  const linkedBill = selectedReading ? billByConsumptionId.get(Number(selectedReading.id)) ?? null : null;
  const selectedConsumptionReceipt = useMemo(() => {
    if (!selectedReading || !linkedBill) return null;
    const readingTime = Date.parse(`${selectedReading.readingDate}T00:00:00Z`);
    const arrears = consumerBillings.reduce((totals, record) => {
      const balance = Number(record.outstandingBalance ?? 0);
      if (record.id === linkedBill.id || record.status === "Paid" || balance <= 0 || !record.dueDate) {
        return totals;
      }
      const overdueDays = Math.floor(
        (readingTime - Date.parse(`${record.dueDate}T00:00:00Z`)) / 86_400_000,
      );
      if (overdueDays >= 90) totals.arrears90Days += balance;
      else if (overdueDays >= 60) totals.arrears60Days += balance;
      else if (overdueDays >= 30) totals.arrears30Days += balance;
      return totals;
    }, { arrears30Days: 0, arrears60Days: 0, arrears90Days: 0 });
    return {
      meterName: selectedReading.consumerName,
      runDate: formatReceiptDate(selectedReading.createdAt ?? selectedReading.readingDate),
      previousReading: selectedReading.previousReading,
      presentReading: selectedReading.currentReading,
      baselineBill: linkedBill.amountDue,
      ...arrears,
    };
  }, [consumerBillings, linkedBill, selectedReading]);

  const openReadingReceipt = (reading) => {
    const bill = billByConsumptionId.get(Number(reading.id)) ?? null;
    if (!bill) {
      toast.error(
        "Receipt unavailable",
        "This reading has no linked billing record yet.",
      );
      return;
    }
    setSelectedReading(reading);
    setReceiptView("consumption");
  };

  const closeReceipt = () => {
    setReceiptView(null);
    setSelectedReading(null);
  };

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
    <main className="min-w-0 space-y-4 sm:space-y-5">
      <button
        className="inline-flex min-h-10 items-center gap-2 rounded-xl px-2 text-xs font-bold text-water-700 hover:bg-water-50 hover:text-water-900"
        onClick={() => navigate("/admin/readings")}
        type="button"
      >
        <ArrowLeft aria-hidden="true" className="h-4 w-4" />
        Back to readings
      </button>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <PageHeader compact title={consumer?.consumerName ?? "Consumer Readings"} />
          {consumer && (
            <p className="mt-1 text-sm text-slate-500">
              {consumer.purok ?? "Unassigned"}
            </p>
          )}
        </div>
        {!loading && yearOptions.length > 0 && (
          <Filter
            ariaLabel="Filter readings by year"
            className="w-full sm:w-44"
            onValueChange={setYear}
            options={yearOptions.map((option) => ({ label: option, value: option }))}
            value={activeYear}
          />
        )}
      </div>
      {error && <div className="flex items-center justify-between gap-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert"><span>{error}</span><button className="font-bold underline" onClick={() => window.location.reload()} type="button">Try again</button></div>}
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
          onViewReceipt={openReadingReceipt}
        />
      )}

      <ConsumptionReceiptModal
        isOpen={receiptView === "consumption" && Boolean(selectedConsumptionReceipt)}
        onClose={closeReceipt}
        receiptData={selectedConsumptionReceipt}
        residentName={consumer?.consumerName}
      />
    </main>
  );
}
