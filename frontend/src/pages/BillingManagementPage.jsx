import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Clock3, Eye } from "lucide-react";
import BillingSummaryCard from "../components/BillingSummaryCard";
import Filter from "../components/Filter";
import LoadingSkeleton from "../components/LoadingSkeleton";
import Modal from "../components/Modal";
import PageHeader from "../components/PageHeader";
import Search from "../components/Search";
import Table from "../components/Table";
import { fetchBillingHistory } from "../services/billingAPI";

const currency = (value) =>
  `₱${Number(value ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

function StatusBadge({ status }) {
  const config = status === "Paid"
    ? { Icon: CheckCircle2, classes: "border-emerald-200 bg-emerald-50 text-emerald-700" }
    : status === "Partially Paid"
      ? { Icon: Clock3, classes: "border-amber-200 bg-amber-50 text-amber-800" }
      : { Icon: AlertCircle, classes: "border-red-200 bg-red-50 text-red-700" };

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold ${config.classes}`}>
      <config.Icon aria-hidden="true" className="h-3.5 w-3.5" />
      {status}
    </span>
  );
}

export default function BillingManagementPage() {
  const [billingHistory, setBillingHistory] = useState([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedResident, setSelectedResident] = useState(null);

  const loadBillingHistory = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      setBillingHistory(await fetchBillingHistory());
    } catch (requestError) {
      setError(
        requestError?.response?.data?.message ??
          requestError.message ??
          "Unable to load billing history.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    const refresh = () =>
      fetchBillingHistory()
        .then((records) => {
          if (active) {
            setBillingHistory(records);
            setError("");
          }
        })
        .catch((requestError) => {
          if (active) {
            setError(
              requestError?.response?.data?.message ??
                requestError.message ??
                "Unable to load billing history.",
            );
          }
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
    billingHistory.forEach((record) => {
      const residentId = String(record.raw?.user_id ?? record.consumerName);
      const current = groups.get(residentId) ?? [];
      current.push(record);
      groups.set(residentId, current);
    });

    return Array.from(groups.entries()).map(([id, billings]) => ({
      id,
      billings: [...billings].sort((first, second) =>
        String(second.raw?.billing_date ?? "").localeCompare(
          String(first.raw?.billing_date ?? ""),
        ) || Number(second.id) - Number(first.id),
      ),
      consumerName: billings[0].consumerName,
      overallBillCount: billings.length,
      overallBillTotal: billings.reduce(
        (total, billing) => total + Number(billing.amountDue || 0),
        0,
      ),
      purok: billings[0].purok,
      statuses: billings.map((billing) => billing.status),
    }));
  }, [billingHistory]);

  const visibleResidents = useMemo(() => {
    const term = query.trim().toLowerCase();

    return residentRows.filter((resident) => {
      const matchesQuery =
        !term ||
        [resident.consumerName, resident.purok].some((value) =>
          String(value).toLowerCase().includes(term),
        );

      return matchesQuery && (status === "all" || resident.statuses.includes(status));
    });
  }, [query, residentRows, status]);

  return (
    <main className="min-w-0 space-y-5 sm:space-y-6">
      <PageHeader
        description="Review billing periods, water usage, account balances, and collection status."
        eyebrow="Billing administration"
        title="Billing management"
      />

      <BillingSummaryCard billingData={billingHistory} />

      <div
        aria-label="Billing table controls"
        className="flex flex-col gap-3 sm:flex-row sm:items-center"
        role="search"
      >
        <Search
          ariaLabel="Search billing history"
          className="flex-1"
          onValueChange={setQuery}
          placeholder="Search resident name or purok"
          value={query}
        />
        <Filter
          ariaLabel="Filter billing status"
          className="w-full sm:w-48"
          onValueChange={setStatus}
          options={[
            { label: "All statuses", value: "all" },
            { label: "Paid", value: "Paid" },
            { label: "Partially paid", value: "Partially Paid" },
            { label: "Unpaid", value: "Unpaid" },
          ]}
          value={status}
        />
      </div>

      {error && (
        <div
          className="flex items-center justify-between gap-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
          role="alert"
        >
          <span>{error}</span>
          <button className="min-h-11 font-bold underline" onClick={loadBillingHistory} type="button">
            Try again
          </button>
        </div>
      )}

      {loading ? (
        <LoadingSkeleton label="Loading billing records" variant="table" />
      ) : (
        <Table
          ariaLabel="Resident billing accounts"
          columns={[
            { key: "name", label: "Name" },
            { key: "purok", label: "Purok" },
            { key: "bills", label: "Overall bills" },
            { key: "action", label: "Action", className: "text-right" },
          ]}
          data={visibleResidents}
          emptyDescription={
            residentRows.length
              ? "No resident matches the current search and status filter."
              : "Residents will appear here when billing records are generated."
          }
          emptyTitle={residentRows.length ? "No matching residents" : "No billing records"}
          getRowKey={(resident) => resident.id}
          rowClassName="grid grid-cols-2 gap-x-3 gap-y-2 p-4 transition-colors hover:bg-slate-50 md:table-row md:p-0"
          tableClassName="block w-full text-left text-sm md:table"
          renderRow={(resident) => (
            <>
              <td className="px-4 py-4 font-extrabold text-navy-900">
                {resident.consumerName}
              </td>
              <td className="px-4 py-4 text-slate-600">{resident.purok}</td>
              <td className="px-4 py-4">
                <p className="font-mono font-extrabold text-navy-900">
                  {resident.overallBillCount} {resident.overallBillCount === 1 ? "bill" : "bills"}
                </p>
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  {currency(resident.overallBillTotal)} total billed
                </p>
              </td>
              <td className="flex flex-col items-stretch justify-end md:table-cell md:px-4 md:py-4 md:text-right">
                <button
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-water-50 px-3 font-bold text-water-700 hover:bg-water-100 md:w-auto md:px-4"
                  onClick={() => setSelectedResident(resident)}
                  type="button"
                >
                  <Eye aria-hidden="true" className="h-4 w-4" />
                  View all billings
                </button>
              </td>
            </>
          )}
        />
      )}

      <Modal
        closeLabel="Close resident billing history"
        description={`${selectedResident?.overallBillCount ?? 0} billing records for this resident.`}
        eyebrow="Resident billing history"
        isOpen={Boolean(selectedResident)}
        onClose={() => setSelectedResident(null)}
        size="xl"
        title={selectedResident?.consumerName}
      >
        <div className="p-4 sm:p-6">
          <Table
            ariaLabel={`${selectedResident?.consumerName ?? "Resident"} billing records`}
            columns={[
              { key: "period", label: "Billing Period" },
              { key: "date", label: "Reading Date" },
              { key: "consumption", label: "Consumption" },
              { key: "total", label: "Total Bill", className: "text-right" },
              { key: "balance", label: "Balance", className: "text-right" },
              { key: "status", label: "Status" },
            ]}
            data={selectedResident?.billings ?? []}
            getRowKey={(billing) => billing.id}
            rowClassName="grid grid-cols-2 gap-x-3 gap-y-2 p-4 transition-colors hover:bg-slate-50 md:table-row md:p-0"
            tableClassName="block w-full text-left text-sm md:table"
            renderRow={(billing) => (
              <>
                <td className="px-4 py-4 font-extrabold text-navy-900">
                  {billing.billingPeriod}
                </td>
                <td className="px-4 py-4 font-mono text-xs text-slate-600">
                  {billing.readingDate}
                </td>
                <td className="px-4 py-4 font-mono text-slate-700">
                  {billing.cubicMetersConsumed} m³
                </td>
                <td className="px-4 py-4 text-right font-mono font-bold tabular-nums text-navy-900">
                  {currency(billing.amountDue)}
                </td>
                <td className="px-4 py-4 text-right font-mono font-bold tabular-nums text-slate-700">
                  {currency(billing.outstandingBalance)}
                </td>
                <td className="px-4 py-4">
                  <StatusBadge status={billing.status} />
                </td>
              </>
            )}
          />
        </div>
      </Modal>
    </main>
  );
}
