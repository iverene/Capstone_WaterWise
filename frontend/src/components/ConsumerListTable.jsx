import { AlertCircle, CheckCircle2, Pencil } from "lucide-react";
import LoadingSkeleton from "./LoadingSkeleton";
import Table from "./Table";

function AccountStatus({ status }) {
  const normalizedStatus = String(status ?? "").trim().toLowerCase();
  const statusConfig = {
    active: {
      className: "border-emerald-200 bg-emerald-50 text-emerald-700",
      Icon: CheckCircle2,
      label: "Active",
    },
    disconnected: {
      className: "border-red-200 bg-red-50 text-red-700",
      Icon: AlertCircle,
      label: "Disconnected",
    },
  };
  const config = statusConfig[normalizedStatus === "active" ? "active" : "disconnected"];
  const { Icon } = config;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${config.className}`}
    >
      <Icon aria-hidden="true" className="h-3.5 w-3.5" />
      {config.label}
    </span>
  );
}

function ConsumerListTable({ consumers = [], isLoading = false, onEdit = () => {} }) {
  const safeConsumers = (Array.isArray(consumers) ? consumers : []).filter(Boolean);
  if (isLoading) {
    return (
      <LoadingSkeleton
        count={5}
        label="Loading resident accounts"
        variant="table"
      />
    );
  }

  return (
    <Table
      ariaLabel="Resident accounts"
      columns={[
        { key: "resident", label: "Resident" },
        { key: "account", label: "Account" },
        { key: "email", label: "Email" },
        { key: "status", label: "Status" },
        { key: "action", label: "Action", className: "text-right" },
      ]}
      data={safeConsumers}
      emptyDescription="Adjust the search or purok filter, or add a resident to the directory."
      emptyTitle="No residents found"
      getRowKey={(consumer) => consumer?.id ?? consumer?.accountName ?? Math.random().toString(36)}
      rowClassName="grid grid-cols-2 gap-x-3 gap-y-2 p-4 transition-colors hover:bg-slate-50 md:table-row md:p-0"
      renderRow={(consumer) => (
        <>
          <td className="col-span-2 md:col-span-1 md:px-4 md:py-4">
            <span className="block font-extrabold leading-5 text-navy-900">{consumer?.fullName || "-"}</span>
            <span className="mt-0.5 block text-xs font-semibold text-slate-500">{consumer?.purok || "Unassigned"}</span>
          </td>
          <td className="font-mono font-bold text-navy-900 md:px-4 md:py-4">
            {consumer?.accountName || "-"}
          </td>
          <td className="min-w-0 break-all text-slate-600 md:px-4 md:py-4">
            {consumer?.email || "No email provided"}
          </td>
          <td className="md:px-4 md:py-4">
            <AccountStatus status={consumer?.status} />
          </td>
          <td className="md:px-4 md:py-4 md:text-right">
            <button
              className="inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-2.5 text-sm font-bold text-navy-900 transition-colors hover:border-water-300 hover:bg-water-50 hover:text-water-700 md:min-h-11 md:w-auto md:px-4"
              onClick={() => onEdit(consumer)}
              type="button"
            >
              <Pencil aria-hidden="true" className="h-4 w-4" />
              Edit
            </button>
          </td>
        </>
      )}
    />
  );
}

export default ConsumerListTable;
