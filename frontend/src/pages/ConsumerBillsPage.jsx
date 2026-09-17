import { useEffect, useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import BillingHistoryTable from "../components/BillingHistoryTable";
import LoadingSkeleton from "../components/LoadingSkeleton";
import PageHeader from "../components/PageHeader";
import { fetchBillingHistory } from "../services/billingAPI";

export default function ConsumerBillsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const residentId = searchParams.get("residentId") ?? "";
  const [billings, setBillings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetchBillingHistory()
      .then((records) => {
        if (active) setBillings(records);
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

  const consumerBillings = useMemo(() => billings
    .filter((billing) => String(billing.raw?.user_id ?? "") === residentId)
    .sort((first, second) =>
      String(second.raw?.billing_date ?? "").localeCompare(String(first.raw?.billing_date ?? "")) ||
      Number(second.id) - Number(first.id),
    ), [billings, residentId]);
  const consumer = consumerBillings[0] ?? null;

  return (
    <main className="min-w-0 space-y-6">
      <button
        className="inline-flex min-h-10 items-center gap-2 rounded-xl px-2 text-xs font-bold text-water-700 hover:bg-water-50 hover:text-water-900"
        onClick={() => navigate("/admin/billings")}
        type="button"
      >
        <ArrowLeft aria-hidden="true" className="h-4 w-4" />
        Back to billings
      </button>
      <div>
        <PageHeader title={consumer?.consumerName ?? "Consumer Bills"} />
        {consumer && (
          <p className="mt-1 text-sm text-slate-500">
            {consumer.purok ?? "Unassigned"}
          </p>
        )}
      </div>

      {error && <div className="flex items-center justify-between gap-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert"><span>{error}</span><button className="font-bold underline" onClick={() => window.location.reload()} type="button">Try again</button></div>}
      {loading ? (
        <LoadingSkeleton label="Loading consumer bills" variant="table" />
      ) : (
        <BillingHistoryTable historyData={consumerBillings} showConsumerDetails={false} />
      )}
    </main>
  );
}
