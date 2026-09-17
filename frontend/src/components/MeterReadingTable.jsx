import { CheckCircle2, Clock3, Pencil, Trash2 } from "lucide-react";
import Table from "./Table";

function ReadingStatus({ status }) {
  const recorded = status === "Recorded";
  const Icon = recorded ? CheckCircle2 : Clock3;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${
        recorded
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-amber-200 bg-amber-50 text-amber-800"
      }`}
    >
      <Icon aria-hidden="true" className="h-3.5 w-3.5" />
      {status || "Pending"}
    </span>
  );
}

const MeterReadingTable = ({
  readings = [],
  onEdit,
  onDelete,
  pageSize,
  readOnly = false,
  readingDateFirst = false,
  showConsumerDetails = true,
  showStatus = true,
  showUsage = true,
}) => {
  return (
      <Table
        ariaLabel="Meter readings"
        pageSize={pageSize}
        columns={[
          ...(showConsumerDetails
            ? [
                { key: "account", label: "Account" },
                { key: "purok", label: "Purok" },
                { key: "resident", label: "Resident" },
              ]
            : []),
          ...(readingDateFirst ? [{ key: "date", label: "Reading date" }] : []),
          { key: "previous", label: "Previous Reading", className: "text-center" },
          { key: "current", label: "Present Reading", className: "text-center" },
          ...(showUsage ? [{ key: "usage", label: "Cubic Used", className: "text-center" }] : []),
          ...(!readingDateFirst ? [{ key: "date", label: "Reading date" }] : []),
          ...(showStatus ? [{ key: "status", label: "Status" }] : []),
          ...(!readOnly ? [{ key: "actions", label: "Actions", className: "text-right" }] : []),
        ]}
        data={readings}
        emptyDescription="Recorded readings will appear here with their submission status."
        emptyTitle="No meter readings found"
        getRowKey={(reading) => reading.id}
        renderRow={(reading) => (
          <>
                {showConsumerDetails && (
                <td className="flex flex-col font-mono text-navy-900 before:mb-1 before:font-sans before:text-xs before:font-semibold before:text-slate-500 before:content-['Account'] md:table-cell md:px-4 md:py-4 md:before:hidden">{reading.consumerNo}</td>
                )}
                {showConsumerDetails && (
                <td className="col-span-2 flex flex-col text-slate-600 before:mb-1 before:text-xs before:font-semibold before:text-slate-500 before:content-['Purok'] md:col-span-1 md:table-cell md:px-4 md:py-4 md:before:hidden">{reading.purok}</td>
                )}
                {showConsumerDetails && (
                <td className="col-span-2 flex flex-col font-bold text-navy-900 before:mb-1 before:text-xs before:font-semibold before:text-slate-500 before:content-['Resident'] md:col-span-1 md:table-cell md:px-4 md:py-4 md:before:hidden">{reading.consumerName}</td>
                )}
                {readingDateFirst && (
                <td className="flex flex-col font-mono text-slate-600 before:mb-1 before:font-sans before:text-xs before:font-semibold before:text-slate-500 before:content-['Date'] md:table-cell md:px-4 md:py-4 md:before:hidden">{reading.readingDate}</td>
                )}
                <td className="flex flex-col font-mono tabular-nums before:mb-1 before:font-sans before:text-xs before:font-semibold before:text-slate-500 before:content-['Previous_Reading'] md:table-cell md:px-4 md:py-4 md:text-center md:before:hidden">{reading.previousReading} m³</td>
                <td className="flex flex-col font-mono tabular-nums before:mb-1 before:font-sans before:text-xs before:font-semibold before:text-slate-500 before:content-['Present_Reading'] md:table-cell md:px-4 md:py-4 md:text-center md:before:hidden">{reading.currentReading} m³</td>
                {showUsage && (
                <td className="flex flex-col font-mono font-bold tabular-nums text-navy-900 before:mb-1 before:font-sans before:text-xs before:font-semibold before:text-slate-500 before:content-['Cubic_Used'] md:table-cell md:px-4 md:py-4 md:text-center md:before:hidden">{reading.consumption} m³</td>
                )}
                {!readingDateFirst && (
                <td className="flex flex-col font-mono text-slate-600 before:mb-1 before:font-sans before:text-xs before:font-semibold before:text-slate-500 before:content-['Date'] md:table-cell md:px-4 md:py-4 md:before:hidden">{reading.readingDate}</td>
                )}
                {showStatus && (
                <td className="flex items-end md:table-cell md:px-4 md:py-4"><ReadingStatus status={reading.status} /></td>
                )}
                {!readOnly && (
                  <td className="col-span-2 md:table-cell md:px-4 md:py-4">
                    <div className="flex gap-2 md:justify-end">
                      <button aria-label={`Edit reading for ${reading.consumerName}`} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3 font-bold text-navy-900 hover:border-water-300 hover:bg-water-50 md:flex-none" onClick={() => onEdit?.(reading)} type="button"><Pencil aria-hidden="true" className="h-4 w-4" />Edit</button>
                      <button aria-label={`Delete reading for ${reading.consumerName}`} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-3 font-bold text-red-700 hover:bg-red-50 md:flex-none" onClick={() => onDelete?.(reading.id)} type="button"><Trash2 aria-hidden="true" className="h-4 w-4" />Delete</button>
                    </div>
                  </td>
                )}
          </>
        )}
      />
  );
};

export default MeterReadingTable;
