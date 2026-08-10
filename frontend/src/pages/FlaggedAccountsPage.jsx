import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarClock, WalletCards } from "lucide-react";
import { useNavigate } from "react-router";
import KPI from "../components/KPI";
import LoadingSkeleton from "../components/LoadingSkeleton";
import Modal from "../components/Modal";
import PageHeader from "../components/PageHeader";
import Search from "../components/Search";
import Table from "../components/Table";
import { useToast } from "../components/Toast";
import { fetchBillingHistory } from "../services/billingAPI";
import {
  disconnectFlaggedConsumer,
  fetchConsumerDirectory,
} from "../services/consumerDirectoryAPI";

const currency = (value) =>
  `₱${Number(value ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

function groupFlaggedAccounts(billingRecords) {
  const groups = new Map();

  billingRecords
    .filter((billing) => Number(billing.outstandingBalance) > 0)
    .forEach((billing) => {
      const residentId = String(billing.raw?.user_id ?? billing.consumerName);
      const current = groups.get(residentId) ?? [];
      current.push(billing);
      groups.set(residentId, current);
    });

  return Array.from(groups.entries())
    .filter(([, bills]) => bills.length >= 3)
    .map(([residentId, bills]) => {
      const sortedBills = [...bills].sort((first, second) => {
        const dateComparison = String(first.raw?.billing_date ?? "").localeCompare(
          String(second.raw?.billing_date ?? ""),
        );
        return dateComparison || Number(first.id) - Number(second.id);
      });
      const oldestBill = sortedBills[0];

      return {
        id: residentId,
        consumerName: oldestBill.consumerName,
        oldestBill,
        oldestPeriod: oldestBill.billingPeriod,
        outstandingBillCount: sortedBills.length,
        purok: oldestBill.purok,
        totalOutstanding: sortedBills.reduce(
          (total, bill) => total + Number(bill.outstandingBalance || 0),
          0,
        ),
      };
    })
    .sort((first, second) =>
      String(first.oldestBill.raw?.billing_date ?? "").localeCompare(
        String(second.oldestBill.raw?.billing_date ?? ""),
      ),
    );
}

export default function FlaggedAccountsPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [billingRecords, setBillingRecords] = useState([]);
  const [consumers, setConsumers] = useState([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [disconnecting, setDisconnecting] = useState(false);

  const loadFlaggedAccounts = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const [billings, consumerDirectory] = await Promise.all([
        fetchBillingHistory(),
        fetchConsumerDirectory(),
      ]);
      setBillingRecords(billings);
      setConsumers(consumerDirectory);
    } catch (requestError) {
      setError(
        requestError?.response?.data?.message ??
          requestError.message ??
          "Unable to load flagged accounts.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;

    Promise.all([fetchBillingHistory(), fetchConsumerDirectory()])
      .then(([records, consumerDirectory]) => {
        if (active) {
          setBillingRecords(records);
          setConsumers(consumerDirectory);
          setError("");
        }
      })
      .catch((requestError) => {
        if (active) {
          setError(
            requestError?.response?.data?.message ??
              requestError.message ??
              "Unable to load flagged accounts.",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const flaggedAccounts = useMemo(
    () => {
      const statuses = new Map(consumers.map((consumer) => [String(consumer.id), consumer.status]));
      return groupFlaggedAccounts(billingRecords).map((account) => ({
        ...account,
        accountStatus: statuses.get(account.id) ?? "active",
      }));
    },
    [billingRecords, consumers],
  );
  const searchTerm = query.trim().toLowerCase();
  const visibleAccounts = flaggedAccounts.filter((account) =>
    !searchTerm ||
    [account.consumerName, account.purok].some((value) =>
      String(value ?? "").toLowerCase().includes(searchTerm),
    ),
  );
  const totalOutstanding = flaggedAccounts.reduce(
    (total, account) => total + account.totalOutstanding,
    0,
  );

  const confirmDisconnection = async () => {
    if (!selectedAccount) return;

    try {
      setDisconnecting(true);
      setError("");
      const updated = await disconnectFlaggedConsumer(selectedAccount.id);
      setConsumers((current) =>
        current.map((consumer) => consumer.id === updated.id ? updated : consumer),
      );
      toast.success(
        "Account disconnected",
        `${selectedAccount.consumerName}'s account is now inactive. The resident has been notified.`,
      );
      setSelectedAccount(null);
    } catch (requestError) {
      const message = requestError?.response?.data?.message ??
        requestError.message ??
        "Unable to disconnect the account.";
      setError(message);
      toast.error("Disconnection failed", message);
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <main className="min-w-0 space-y-6">
      <PageHeader
        description="Review residents with three or more outstanding monthly bills for disconnection action."
        eyebrow="Account monitoring"
        title="Flagged accounts"
      />

      <section aria-label="Flagged account summary" className="grid gap-3 sm:grid-cols-2">
        <KPI
          description="Residents with at least 3 outstanding bills"
          icon={AlertTriangle}
          title="For disconnection"
          value={flaggedAccounts.length}
        />
        <KPI
          description="Combined balance of flagged accounts"
          icon={WalletCards}
          title="Outstanding balance"
          value={currency(totalOutstanding)}
        />
      </section>

      <Search
        ariaLabel="Search flagged accounts by resident name or purok"
        onValueChange={setQuery}
        placeholder="Search resident name or purok"
        value={query}
      />

      {error && (
        <div className="flex items-center justify-between gap-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">
          <span>{error}</span>
          <button className="min-h-11 font-bold underline" onClick={loadFlaggedAccounts} type="button">
            Try again
          </button>
        </div>
      )}

      {loading ? (
        <LoadingSkeleton label="Loading flagged accounts" variant="table" />
      ) : (
        <Table
          ariaLabel="Accounts flagged for disconnection"
          columns={[
            { key: "resident", label: "Name" },
            { key: "bills", label: "Outstanding bills" },
            { key: "oldest", label: "Oldest unpaid period" },
            { key: "balance", label: "Total balance", className: "text-right" },
            { key: "status", label: "Status" },
            { key: "action", label: "Action", className: "text-right" },
          ]}
          data={visibleAccounts}
          emptyDescription={
            flaggedAccounts.length
              ? "No flagged account matches your search."
              : "Residents will appear here when they reach three outstanding monthly bills."
          }
          emptyTitle={flaggedAccounts.length ? "No matching accounts" : "No accounts flagged"}
          getRowKey={(account) => account.id}
          rowClassName="grid grid-cols-2 gap-x-3 gap-y-3 p-4 transition-colors hover:bg-slate-50 md:table-row md:p-0"
          tableClassName="block w-full text-left text-sm md:table"
          renderRow={(account) => (
            <>
              <td className="px-4 py-4">
                <p className="font-bold text-slate-900">{account.consumerName}</p>
                <p className="mt-1 text-xs text-slate-500">{account.purok}</p>
              </td>
              <td className="px-4 py-4 font-mono font-extrabold text-red-700">
                {account.outstandingBillCount}
              </td>
              <td className="px-4 py-4">
                <span className="inline-flex items-center gap-2 font-semibold text-slate-700">
                  <CalendarClock aria-hidden="true" className="h-4 w-4 text-slate-400" />
                  {account.oldestPeriod}
                </span>
              </td>
              <td className="px-4 py-4 text-right font-mono font-extrabold tabular-nums text-navy-900">
                {currency(account.totalOutstanding)}
              </td>
              <td className="px-4 py-4">
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold ${
                  account.accountStatus === "inactive"
                    ? "border-slate-300 bg-slate-100 text-slate-700"
                    : "border-red-200 bg-red-50 text-red-700"
                }`}>
                  <AlertTriangle aria-hidden="true" className="h-3.5 w-3.5" />
                  {account.accountStatus === "inactive" ? "Disconnected" : "For disconnection"}
                </span>
              </td>
              <td className="col-span-2 pt-1 md:px-4 md:py-4 md:text-right">
                <div className="grid gap-2 sm:grid-cols-2 md:flex md:justify-end">
                  <button
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-water-50 px-3 font-bold text-water-700 hover:bg-water-100"
                    onClick={() => navigate(`/admin/payments?billingId=${account.oldestBill.id}`)}
                    type="button"
                  >
                    <WalletCards aria-hidden="true" className="h-4 w-4" />
                    Pay bill
                  </button>
                  <button
                    className="min-h-11 rounded-xl bg-red-600 px-3 font-bold text-white hover:bg-red-700 disabled:cursor-default disabled:bg-slate-200 disabled:text-slate-500"
                    disabled={account.accountStatus === "inactive"}
                    onClick={() => setSelectedAccount(account)}
                    type="button"
                  >
                    {account.accountStatus === "inactive" ? "Disconnected" : "Confirm disconnection"}
                  </button>
                </div>
              </td>
            </>
          )}
        />
      )}

      <Modal
        closeLabel="Cancel account disconnection"
        description="This action prevents the resident from signing in until an admin reactivates the account."
        eyebrow="Account action"
        isOpen={Boolean(selectedAccount)}
        onClose={() => {
          if (!disconnecting) setSelectedAccount(null);
        }}
        size="sm"
        title="Confirm disconnection"
      >
        <div className="p-5 sm:p-6">
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
            <p className="font-bold text-red-900">{selectedAccount?.consumerName}</p>
            <p className="mt-2 text-sm leading-6 text-red-700">
              This resident has {selectedAccount?.outstandingBillCount} outstanding monthly bills
              totaling {currency(selectedAccount?.totalOutstanding)}. A critical account-status
              notification will be sent after confirmation.
            </p>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <button
              className="min-h-12 rounded-xl border border-slate-300 bg-white px-4 font-bold text-navy-900 hover:bg-slate-50"
              disabled={disconnecting}
              onClick={() => setSelectedAccount(null)}
              type="button"
            >
              Cancel
            </button>
            <button
              className="min-h-12 rounded-xl bg-red-600 px-4 font-bold text-white hover:bg-red-700 disabled:bg-red-300"
              disabled={disconnecting}
              onClick={confirmDisconnection}
              type="button"
            >
              {disconnecting ? "Disconnecting…" : "Confirm disconnection"}
            </button>
          </div>
        </div>
      </Modal>
    </main>
  );
}
