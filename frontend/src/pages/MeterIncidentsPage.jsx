import { useCallback, useEffect, useMemo, useState } from "react";
import { Pencil } from "lucide-react";
import DiscardChangesDialog from "../components/DiscardChangesDialog";
import Filter from "../components/Filter";
import LoadingSkeleton from "../components/LoadingSkeleton";
import Modal from "../components/Modal";
import PageHeader from "../components/PageHeader";
import Search from "../components/Search";
import Table from "../components/Table";
import { useToast } from "../components/Toast";
import { fetchConsumerDirectory } from "../services/consumerDirectoryAPI";
import { correctMeterIncident, fetchMeterIncidents } from "../services/meterIncidentAPI";

const currencyFormat = new Intl.DateTimeFormat("en-PH", {
  dateStyle: "medium",
  timeZone: "Asia/Manila",
});

const formatDate = (value) => {
  if (!value) return "—";
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00+08:00`);
  return Number.isNaN(date.getTime()) ? String(value) : currencyFormat.format(date);
};

const number = (value) => Number(value ?? 0);

const requestMessage = (error, fallback) =>
  error?.response?.data?.message ?? error.message ?? fallback;

// Same filter as Record Meter Reading: digits with up to two decimal places.
const acceptsDecimal = (value) => /^\d*(\.\d{0,2})?$/.test(value);

const emptyCorrectionForm = () => ({
  oldFinalReading: "",
  newMeterSerial: "",
  newBaseline: "0",
});

const correctionFormFromIncident = (incident) => ({
  oldFinalReading:
    incident.oldFinalReading == null ? "" : String(incident.oldFinalReading),
  newMeterSerial: incident.newMeterSerial ?? "",
  newBaseline: String(incident.newBaseline ?? 0),
});

const isOpenIncident = (incident) =>
  ["pending", "authorized"].includes(incident?.status);

const isReplacementIncident = (incident) =>
  incident?.incidentType === "replacement";

const isEditableReplacement = (incident) =>
  isOpenIncident(incident) && isReplacementIncident(incident);

const basisLabel = {
  final_reading: "Old meter closing reading",
  previous_reading_fallback: "Latest reading fallback",
  previous_consumption: "Previous consumption",
  zero_carry: "No carried usage",
  minimum_charge: "Minimum charge",
  three_month_average: "Three-month average",
  reported: "Resident reported",
  average: "System average",
};

const statusLabel = {
  pending: "Not applied",
  authorized: "Recorded",
  consumed: "Applied to a reading",
  rejected: "Rejected",
  expired: "Expired",
};

const statusTone = {
  pending: "bg-amber-50 text-amber-800 ring-amber-200",
  authorized: "bg-water-50 text-water-700 ring-water-200",
  consumed: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  rejected: "bg-red-50 text-red-700 ring-red-200",
  expired: "bg-slate-100 text-slate-600 ring-slate-200",
};

const badge = (label, tone) => (
  <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ring-inset ${tone}`}>
    {label}
  </span>
);

export default function MeterIncidentsPage() {
  const toast = useToast();
  const [incidents, setIncidents] = useState([]);
  const [consumers, setConsumers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [editingIncident, setEditingIncident] = useState(null);
  const [correctionForm, setCorrectionForm] = useState(emptyCorrectionForm);
  const [correctionError, setCorrectionError] = useState("");
  const [savingCorrection, setSavingCorrection] = useState(false);
  const [isCorrectionDiscardOpen, setIsCorrectionDiscardOpen] = useState(false);

  const consumerById = useMemo(
    () => new Map(consumers.map((consumer) => [consumer.id, consumer])),
    [consumers],
  );

  const loadData = useCallback(async (isActive = () => true) => {
    if (!isActive()) return;
    try {
      setLoading(true);
      setError("");
      const [incidentList, directory] = await Promise.all([
        fetchMeterIncidents(),
        fetchConsumerDirectory(),
      ]);
      if (!isActive()) return;
      setIncidents(incidentList);
      setConsumers(directory);
    } catch (requestError) {
      if (!isActive()) return;
      setError(
        requestError?.response?.data?.message ??
          requestError.message ??
          "Unable to load meter incidents.",
      );
    } finally {
      if (isActive()) setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => loadData(() => active));
    return () => {
      active = false;
    };
  }, [loadData]);

  const visibleIncidents = useMemo(() => {
    const term = query.trim().toLowerCase();
    return incidents.filter((incident) => {
      const consumer = consumerById.get(incident.consumerId);
      const name = incident.consumerName ?? consumer?.consumerName ?? "";
      const matchesQuery = !term || String(name).toLowerCase().includes(term);
      const matchesStatus = statusFilter === "all" || incident.status === statusFilter;
      return matchesQuery && matchesStatus;
    });
  }, [consumerById, incidents, query, statusFilter]);

  const openAuthorizations = incidents.filter(isOpenIncident).length;
  const applied = incidents.filter((incident) => incident.status === "consumed").length;
  const editingConsumer = editingIncident
    ? consumerById.get(editingIncident.consumerId)
    : null;
  const editingName = editingIncident
    ? editingIncident.consumerName ??
      editingConsumer?.consumerName ??
      `Consumer #${editingIncident.consumerId}`
    : "";
  const correctionInitial = editingIncident
    ? correctionFormFromIncident(editingIncident)
    : emptyCorrectionForm();
  const hasCorrectionChanges =
    Boolean(editingIncident) &&
    (correctionForm.oldFinalReading !== correctionInitial.oldFinalReading ||
      correctionForm.newMeterSerial !== correctionInitial.newMeterSerial ||
      correctionForm.newBaseline !== correctionInitial.newBaseline);

  const openCorrection = (incident) => {
    if (!isEditableReplacement(incident)) return;
    setEditingIncident(incident);
    setCorrectionForm(correctionFormFromIncident(incident));
    setCorrectionError("");
  };

  const closeCorrection = () => {
    if (savingCorrection) return;
    setEditingIncident(null);
    setCorrectionError("");
    setIsCorrectionDiscardOpen(false);
  };

  // Match the resident form: do not discard a correction with typed changes
  // without asking first.
  const requestCloseCorrection = () => {
    if (savingCorrection) return;
    if (hasCorrectionChanges) {
      setIsCorrectionDiscardOpen(true);
      return;
    }
    closeCorrection();
  };

  const discardCorrection = () => {
    setIsCorrectionDiscardOpen(false);
    closeCorrection();
  };

  const updateCorrectionField = (field) => (event) => {
    const { value } = event.target;
    setCorrectionForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const updateCorrectionDecimalField = (field) => (event) => {
    const { value } = event.target;
    if (!acceptsDecimal(value)) return;
    setCorrectionForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const submitCorrection = async (event) => {
    event.preventDefault();
    if (!editingIncident) return;

    const closingReading =
      correctionForm.oldFinalReading === ""
        ? null
        : Number(correctionForm.oldFinalReading);
    if (closingReading == null) {
      setCorrectionError("Enter the old meter closing reading.");
      return;
    }
    if (
      closingReading != null &&
      (!Number.isFinite(closingReading) || closingReading < 0)
    ) {
      setCorrectionError("Enter a valid old meter closing reading.");
      return;
    }

    const baseline =
      correctionForm.newBaseline === "" ? 0 : Number(correctionForm.newBaseline);
    if (!Number.isFinite(baseline) || baseline < 0) {
      setCorrectionError("Enter a non-negative new meter baseline.");
      return;
    }

    try {
      setSavingCorrection(true);
      setCorrectionError("");
      const updated = await correctMeterIncident(editingIncident.id, {
        oldFinalReading: closingReading,
        newMeterSerial: correctionForm.newMeterSerial,
        newBaseline: baseline,
      });
      if (!updated) {
        throw new Error("The correction did not return an updated record.");
      }
      setIncidents((current) =>
        current.map((incident) =>
          incident.id === updated.id
            ? { ...incident, ...updated, consumerName: incident.consumerName }
            : incident,
        ),
      );
      if (updated?.warning) {
        toast.warning("Meter replacement corrected", updated.warning);
      } else {
        toast.success(
          "Meter replacement corrected",
          "The next reading will use the corrected details.",
        );
      }
      setEditingIncident(null);
    } catch (requestError) {
      setCorrectionError(
        requestMessage(requestError, "Unable to correct the meter replacement."),
      );
    } finally {
      setSavingCorrection(false);
    }
  };

  return (
    <main className="min-w-0 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageHeader
          eyebrow="Meter operations"
          title="Meter Incidents"
        />
        <p
          aria-live="polite"
          className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-500 shadow-sm"
        >
          {incidents.length} record{incidents.length === 1 ? "" : "s"} · {openAuthorizations} open · {applied} applied
        </p>
      </div>

      <div className="rounded-xl border border-water-100 bg-water-50 p-4 text-sm leading-6 text-water-900">
        <p className="font-bold">How a replacement is billed</p>
        <p className="mt-1 text-[13px] text-slate-600">
          The old meter&apos;s carried usage is added to the new meter&apos;s first reading. A closing value above the
          latest reading uses their difference. An equal or lower closing value carries the resident&apos;s previous
          consumption. No average is used.
        </p>
      </div>

      <div aria-label="Meter incidents table controls" className="hidden items-center gap-2 sm:flex" role="search">
        <Search
          ariaLabel="Search meter incidents by resident name"
          className="flex-1"
          onValueChange={setQuery}
          placeholder="Search resident name"
          value={query}
        />
        <Filter
          ariaLabel="Filter by meter record status"
          className="w-full sm:w-48"
          onValueChange={setStatusFilter}
          options={[
            { label: "All", value: "all" },
            { label: "Recorded", value: "authorized" },
            { label: "Applied", value: "consumed" },
          ]}
          value={statusFilter}
        />
      </div>

      {error && (
        <div className="flex items-center justify-between gap-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">
          <span>{error}</span>
          <button className="font-bold underline" onClick={() => loadData()} type="button">Try again</button>
        </div>
      )}

      {loading ? (
        <LoadingSkeleton label="Loading meter incidents" variant="table" />
      ) : (
        <Table
          ariaLabel="Meter incidents"
          columns={[
            { key: "resident", label: "Resident" },
            { key: "incident", label: "Replacement" },
            { key: "prior", label: "Carried over", className: "text-center" },
            { key: "baseline", label: "New baseline", className: "text-center" },
            { key: "status", label: "Status" },
            { key: "actions", label: "Actions", className: "text-right" },
          ]}
          data={visibleIncidents}
          emptyDescription="Meter replacements recorded by the field team will appear here."
          emptyTitle="No meter records found"
          getRowKey={(incident) => incident.id}
          renderRow={(incident) => {
            const consumer = consumerById.get(incident.consumerId);
            const name = incident.consumerName ?? consumer?.consumerName ?? `Consumer #${incident.consumerId}`;
            return (
              <>
                <td className="md:px-4 md:py-4">
                  <span className="block font-extrabold leading-5 text-navy-900">{name}</span>
                  <span className="mt-0.5 block text-xs font-semibold text-slate-500">
                    {consumer?.purok ?? "Unassigned"}
                  </span>
                </td>
                <td className="md:px-4 md:py-4">
                  <span className="block text-sm font-bold capitalize text-navy-900">{incident.incidentType}</span>
                  <span className="mt-0.5 block text-xs font-semibold text-slate-500">
                    {formatDate(incident.effectiveDate)} · {incident.source === "admin" ? "Admin" : "Field"}
                  </span>
                </td>
                <td className="md:px-4 md:py-4 md:text-center">
                  <span className="block font-mono font-bold tabular-nums text-navy-900">
                    {number(incident.priorUsage).toLocaleString()} m³
                  </span>
                  <span className="mt-0.5 block text-xs font-semibold text-slate-500">
                    {basisLabel[incident.priorUsageBasis] ?? incident.priorUsageBasis}
                  </span>
                </td>
                <td className="font-mono tabular-nums md:px-4 md:py-4 md:text-center">
                  {number(incident.newBaseline).toLocaleString()} m³
                </td>
                <td className="md:px-4 md:py-4">
                  {badge(statusLabel[incident.status] ?? incident.status, statusTone[incident.status] ?? statusTone.expired)}
                </td>
                <td className="md:px-4 md:py-4 md:text-right">
                  {isEditableReplacement(incident) ? (
                    <button
                      aria-label={`Edit replacement for ${name}`}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-navy-900 transition-colors hover:border-water-300 hover:bg-water-50"
                      onClick={() => openCorrection(incident)}
                      type="button"
                    >
                      <Pencil aria-hidden="true" className="h-3.5 w-3.5" />
                      Edit
                    </button>
                  ) : (
                    <span className="text-xs font-semibold text-slate-400">
                      {isOpenIncident(incident) ? "Legacy record" : "Locked"}
                    </span>
                  )}
                </td>
              </>
            );
          }}
        />
      )}

      <Modal
        closeLabel="Close correction form"
        closeOnOverlay={false}
        description="Update the recorded replacement before the next reading applies it."
        dismissible={!savingCorrection}
        eyebrow="Meter correction"
        isOpen={Boolean(editingIncident)}
        onClose={requestCloseCorrection}
        showCloseButton={false}
        size="md"
        title="Correct meter replacement"
      >
        {editingIncident && (
          <form className="space-y-4 p-5 sm:p-6" onSubmit={submitCorrection}>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-bold text-navy-900">{editingName}</p>
                <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-800 ring-1 ring-inset ring-amber-200">
                  Recorded replacement only
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-600">
                Account {editingConsumer?.consumerNo ?? "—"} · {editingConsumer?.purok ?? "Unassigned"}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
              <span className="font-semibold text-slate-500">Currently carried over</span>{" "}
              <span className="font-mono font-bold tabular-nums text-navy-900">
                {number(editingIncident.priorUsage).toLocaleString()} m³
              </span>{" "}
              <span className="font-semibold text-slate-500">
                · {basisLabel[editingIncident.priorUsageBasis] ?? editingIncident.priorUsageBasis}
              </span>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="block text-sm font-bold text-slate-700">
                Effective date
                <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold text-navy-900">
                  {formatDate(editingIncident.effectiveDate)}
                </div>
                <span className="mt-1.5 block text-xs font-medium leading-5 text-slate-500">
                  This date comes from the original log and cannot be changed here.
                </span>
              </div>

              <label className="block text-sm font-bold text-slate-700">
                Old meter closing reading
                <input
                  className="ww-field mt-2 p-3 font-mono tabular-nums"
                  inputMode="decimal"
                  onChange={updateCorrectionDecimalField("oldFinalReading")}
                  placeholder="Required"
                  required
                  type="text"
                  value={correctionForm.oldFinalReading}
                />
                <span className="mt-1.5 block text-xs font-medium leading-5 text-slate-500">
                  A higher value uses the difference from the latest reading. An equal or lower value uses the previous consumption.
                </span>
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-bold text-slate-700">
                New meter serial
                <input
                  className="ww-field mt-2 p-3"
                  onChange={updateCorrectionField("newMeterSerial")}
                  placeholder="Optional"
                  type="text"
                  value={correctionForm.newMeterSerial}
                />
              </label>
              <label className="block text-sm font-bold text-slate-700">
                New meter baseline
                <input
                  className="ww-field mt-2 p-3 font-mono tabular-nums"
                  inputMode="decimal"
                  onChange={updateCorrectionDecimalField("newBaseline")}
                  placeholder="0"
                  type="text"
                  value={correctionForm.newBaseline}
                />
                <span className="mt-1.5 block text-xs font-medium leading-5 text-slate-500">
                  The first value printed on the new meter. Use 0 when it starts at zero.
                </span>
              </label>
            </div>

            {correctionError && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
                {correctionError}
              </div>
            )}

            <div className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-4 sm:flex-row sm:justify-end">
              <button
                className="min-h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-navy-900 hover:bg-slate-50 disabled:opacity-60"
                disabled={savingCorrection}
                onClick={requestCloseCorrection}
                type="button"
              >
                Cancel
              </button>
              <button
                className="ww-primary-button min-h-11 px-4 text-sm disabled:opacity-60"
                disabled={savingCorrection}
                type="submit"
              >
                {savingCorrection ? "Saving…" : "Save correction"}
              </button>
            </div>
          </form>
        )}
      </Modal>

      <DiscardChangesDialog
        description="Are you sure you want to discard the changes to this correction?"
        isOpen={isCorrectionDiscardOpen}
        onDiscard={discardCorrection}
        onKeepEditing={() => setIsCorrectionDiscardOpen(false)}
      />
    </main>
  );
}
