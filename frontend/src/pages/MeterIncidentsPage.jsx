import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  History,
  Plus,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import Filter from "../components/Filter";
import KPI from "../components/KPI";
import LoadingSkeleton from "../components/LoadingSkeleton";
import Modal from "../components/Modal";
import PageHeader from "../components/PageHeader";
import ResidentPicker from "../components/ResidentPicker";
import Search from "../components/Search";
import Table from "../components/Table";
import { useToast } from "../components/Toast";
import { fetchConsumerDirectory } from "../services/consumerDirectoryAPI";
import { fetchRecordingContext } from "../services/meterReadingAPI";
import {
  approveMeterIncident,
  fetchConsumerMeterIncidents,
  fetchMeterIncidents,
  logMeterIncident,
  rejectMeterIncident,
} from "../services/meterIncidentAPI";
import { fetchSystemSetting } from "../services/systemSettingsService";

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

const basisLabel = {
  final_reading: "Old meter closing reading",
  reported: "Resident reported",
  average: "System average",
};

const statusLabel = {
  pending: "Open",
  authorized: "Authorized",
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

const reviewLabel = {
  pending: "Needs review",
  approved: "Approved",
  rejected: "Rejected",
};

const reviewTone = {
  pending: "bg-amber-50 text-amber-800 ring-amber-200",
  approved: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  rejected: "bg-red-50 text-red-700 ring-red-200",
};

const badge = (label, tone) => (
  <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ring-inset ${tone}`}>
    {label}
  </span>
);

const emptyForm = {
  consumerId: "",
  incidentType: "replacement",
  effectiveDate: new Date().toISOString().slice(0, 10),
  oldMeterSerial: "",
  oldFinalReading: "",
  newMeterSerial: "",
  newBaseline: "0",
  notes: "",
};

export default function MeterIncidentsPage() {
  const toast = useToast();
  const [incidents, setIncidents] = useState([]);
  const [consumers, setConsumers] = useState([]);
  const [averageWindow, setAverageWindow] = useState(3);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [reviewFilter, setReviewFilter] = useState("pending");
  const [statusFilter, setStatusFilter] = useState("all");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [lastRecordedReading, setLastRecordedReading] = useState(null);
  const [saving, setSaving] = useState(false);
  const [reviewingId, setReviewingId] = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [historyTarget, setHistoryTarget] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const consumerById = useMemo(
    () => new Map(consumers.map((consumer) => [consumer.id, consumer])),
    [consumers],
  );

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const [incidentList, directory] = await Promise.all([
        fetchMeterIncidents(),
        fetchConsumerDirectory(),
      ]);
      setIncidents(incidentList);
      setConsumers(directory);
    } catch (requestError) {
      setError(
        requestError?.response?.data?.message ??
          requestError.message ??
          "Unable to load meter incidents.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    let active = true;
    fetchSystemSetting("average_window_months")
      .then((setting) => {
        const value = Number(setting?.data?.setting_value ?? setting?.setting_value);
        if (active && Number.isInteger(value) && value > 0) setAverageWindow(value);
      })
      .catch(() => {
        // The backend falls back to 3 when the setting is unavailable.
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!isFormOpen || !form.consumerId) {
      return undefined;
    }
    let active = true;
    fetchRecordingContext(form.consumerId)
      .then((result) => {
        if (!active) return;
        setLastRecordedReading(result.latestPresentReading ?? null);
      })
      .catch(() => {
        if (!active) return;
        setLastRecordedReading(null);
      });
    return () => {
      active = false;
    };
  }, [form.consumerId, isFormOpen]);

  const visibleIncidents = useMemo(() => {
    const term = query.trim().toLowerCase();
    return incidents.filter((incident) => {
      const consumer = consumerById.get(incident.consumerId);
      const name = incident.consumerName ?? consumer?.consumerName ?? "";
      const matchesQuery = !term || String(name).toLowerCase().includes(term);
      const matchesReview = reviewFilter === "all" || incident.reviewStatus === reviewFilter;
      const matchesStatus = statusFilter === "all" || incident.status === statusFilter;
      return matchesQuery && matchesReview && matchesStatus;
    });
  }, [consumerById, incidents, query, reviewFilter, statusFilter]);

  const pendingReview = incidents.filter((incident) => incident.reviewStatus === "pending").length;
  const openAuthorizations = incidents.filter((incident) =>
    ["pending", "authorized"].includes(incident.status),
  ).length;
  const applied = incidents.filter((incident) => incident.status === "consumed").length;

  const startReject = (incident) => {
    setRejectTarget(incident);
    setRejectReason("");
  };

  const handleApprove = async (incident) => {
    try {
      setReviewingId(incident.id);
      await approveMeterIncident(incident.id);
      toast.success("Meter incident approved", "Payments for this resident are no longer on hold.");
      await loadData();
    } catch (requestError) {
      toast.error(
        "Approval failed",
        requestError?.response?.data?.message ?? requestError.message ?? "Unable to approve the incident.",
      );
    } finally {
      setReviewingId(null);
    }
  };

  const handleReject = async () => {
    if (!rejectTarget) return;
    if (!rejectReason.trim()) {
      toast.error("Reason required", "Explain why the meter incident is being rejected.");
      return;
    }
    try {
      setReviewingId(rejectTarget.id);
      await rejectMeterIncident(rejectTarget.id, rejectReason.trim());
      toast.success("Meter incident rejected", "The field reading must be corrected before payment.");
      setRejectTarget(null);
      setRejectReason("");
      await loadData();
    } catch (requestError) {
      toast.error(
        "Rejection failed",
        requestError?.response?.data?.message ?? requestError.message ?? "Unable to reject the incident.",
      );
    } finally {
      setReviewingId(null);
    }
  };

  const openHistory = async (incident) => {
    setHistoryTarget(incident);
    setHistory([]);
    setHistoryLoading(true);
    try {
      setHistory(await fetchConsumerMeterIncidents(incident.consumerId));
    } catch (requestError) {
      toast.error(
        "History unavailable",
        requestError?.response?.data?.message ?? requestError.message ?? "Unable to load the meter history.",
      );
    } finally {
      setHistoryLoading(false);
    }
  };

  const openForm = () => {
    setForm(emptyForm);
    setLastRecordedReading(null);
    setIsFormOpen(true);
  };

  const updateForm = (field) => (event) => {
    const { value } = event.target;
    setForm((current) => ({ ...current, [field]: value }));
  };

  const closingDerived = useMemo(() => {
    if (form.oldFinalReading === "") return null;
    const entered = Number(form.oldFinalReading);
    if (!Number.isFinite(entered)) return null;
    if (lastRecordedReading == null) return entered;
    return Math.round((entered - Number(lastRecordedReading)) * 100) / 100;
  }, [form.oldFinalReading, lastRecordedReading]);

  const hasClosingReading = form.oldFinalReading !== "";
  // The carry is measured here when the closing reading exists. When it does
  // not, the next reading settles it from the resident's own average, so this
  // form never decides or displays an average.
  const carried = closingDerived;

  const submitForm = async (event) => {
    event.preventDefault();
    if (!form.consumerId) {
      toast.error("Resident required", "Select the resident whose meter was replaced.");
      return;
    }
    if (form.incidentType !== "defective" && carried != null && (!Number.isFinite(carried) || carried < 0)) {
      toast.error(
        "Closing reading too low",
        "The old meter's closing reading cannot be lower than the last recorded reading.",
      );
      return;
    }

    try {
      setSaving(true);
      const saved = await logMeterIncident({
        ...form,
        oldFinalReading: hasClosingReading ? form.oldFinalReading : "",
        priorUsageBasis: hasClosingReading ? "final_reading" : "average",
        priorUsage: "",
      });
      if (saved?.warning) {
        toast.warning("Meter incident logged", saved.warning);
      } else {
        toast.success(
          "Meter incident logged",
          "The authorization is ready. The next reading for this resident will carry the old meter's usage.",
        );
      }
      setIsFormOpen(false);
      setForm(emptyForm);
      await loadData();
    } catch (requestError) {
      toast.error(
        "Incident not logged",
        requestError?.response?.data?.message ?? requestError.message ?? "Unable to log the meter incident.",
      );
    } finally {
      setSaving(false);
    }
  };

  const selectedConsumer = consumerById.get(Number(form.consumerId));

  return (
    <main className="min-w-0 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageHeader
          eyebrow="Meter operations"
          title="Meter Incidents"
        />
        <button
          className="ww-primary-button inline-flex min-h-11 items-center gap-2 px-4 text-sm"
          onClick={openForm}
          type="button"
        >
          <Plus aria-hidden="true" className="h-4 w-4" />
          Log meter incident
        </button>
      </div>

      <section aria-label="Meter incident summary" className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
        <KPI compact description="Awaiting admin review" icon={AlertTriangle} title="Needs review" value={pendingReview} />
        <KPI compact description="Not yet applied" icon={ShieldCheck} title="Open authorizations" value={openAuthorizations} />
        <KPI compact description="Carried into a bill" icon={CheckCircle2} title="Applied incidents" value={applied} />
        <KPI compact description="Configurable in Settings" icon={Clock} title="Average window" unit="months" value={averageWindow} />
      </section>

      <div className="rounded-xl border border-water-100 bg-water-50 p-4 text-sm leading-6 text-water-900">
        <p className="font-bold">How a replacement is billed</p>
        <p className="mt-1 text-[13px] text-slate-600">
          The old meter&apos;s remaining usage is added to the new meter&apos;s first reading. Enter the old
          meter&apos;s closing reading when it was recorded and the carry is measured against the last reading.
          When it was not recorded, the carry is estimated from the resident&apos;s average of the last{" "}
          {averageWindow} actual readings at the next reading. If the swap measured nothing at all, the reading
          itself is estimated from that average and stays on hold until you approve it.
        </p>
      </div>

      <div
        aria-label="Meter incident table controls"
        className="flex flex-col gap-3 sm:flex-row sm:items-center"
        role="search"
      >
        <Search
          ariaLabel="Search meter incidents by resident name"
          className="flex-1"
          onValueChange={setQuery}
          placeholder="Search resident name"
          value={query}
        />
        <Filter
          ariaLabel="Filter by review status"
          className="w-full sm:w-48"
          onValueChange={setReviewFilter}
          options={[
            { label: "Needs review", value: "pending" },
            { label: "Approved", value: "approved" },
            { label: "Rejected", value: "rejected" },
            { label: "All reviews", value: "all" },
          ]}
          value={reviewFilter}
        />
        <Filter
          ariaLabel="Filter by incident status"
          className="w-full sm:w-48"
          onValueChange={setStatusFilter}
          options={[
            { label: "All statuses", value: "all" },
            { label: "Open", value: "pending" },
            { label: "Authorized", value: "authorized" },
            { label: "Applied", value: "consumed" },
            { label: "Rejected", value: "rejected" },
            { label: "Expired", value: "expired" },
          ]}
          value={statusFilter}
        />
      </div>

      {error && (
        <div className="flex items-center justify-between gap-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">
          <span>{error}</span>
          <button className="font-bold underline" onClick={loadData} type="button">Try again</button>
        </div>
      )}

      {loading ? (
        <LoadingSkeleton label="Loading meter incidents" variant="table" />
      ) : (
        <Table
          ariaLabel="Meter incidents"
          columns={[
            { key: "resident", label: "Resident" },
            { key: "incident", label: "Incident" },
            { key: "prior", label: "Carried over", className: "text-center" },
            { key: "baseline", label: "New baseline", className: "text-center" },
            { key: "status", label: "Status" },
            { key: "action", label: "Action", className: "text-right" },
          ]}
          data={visibleIncidents}
          emptyDescription={
            reviewFilter === "pending"
              ? "Field-discovered meter replacements appear here for approval."
              : "Adjust the search or filters to see other incidents."
          }
          emptyTitle={reviewFilter === "pending" ? "No incidents need review" : "No meter incidents found"}
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
                  <div className="flex flex-wrap gap-1.5">
                    {badge(statusLabel[incident.status] ?? incident.status, statusTone[incident.status] ?? statusTone.expired)}
                    {badge(reviewLabel[incident.reviewStatus] ?? incident.reviewStatus, reviewTone[incident.reviewStatus] ?? reviewTone.pending)}
                  </div>
                  {incident.rejectedReason && (
                    <span className="mt-1.5 block max-w-[16rem] text-xs font-medium text-red-700">
                      {incident.rejectedReason}
                    </span>
                  )}
                </td>
                <td className="md:px-4 md:py-4 md:text-right">
                  <div className="inline-flex flex-wrap justify-end gap-2">
                    {incident.reviewStatus === "pending" && (
                      <>
                        <button
                          aria-label={`Approve the meter incident for ${name}`}
                          className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-xs font-bold text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
                          disabled={reviewingId === incident.id}
                          onClick={() => handleApprove(incident)}
                          type="button"
                        >
                          <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
                          Approve
                        </button>
                        <button
                          aria-label={`Reject the meter incident for ${name}`}
                          className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 text-xs font-bold text-red-700 hover:bg-red-100 disabled:opacity-60"
                          disabled={reviewingId === incident.id}
                          onClick={() => startReject(incident)}
                          type="button"
                        >
                          <XCircle aria-hidden="true" className="h-4 w-4" />
                          Reject
                        </button>
                      </>
                    )}
                    <button
                      aria-label={`View meter history for ${name}`}
                      className="inline-flex min-h-11 w-11 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:border-water-300 hover:bg-water-50 hover:text-water-700"
                      onClick={() => openHistory(incident)}
                      type="button"
                    >
                      <History aria-hidden="true" className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </>
            );
          }}
        />
      )}

      <Modal
        description="Pre-authorize a replacement so the next field reading carries the old meter's usage."
        eyebrow="Meter operations"
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        size="md"
        title="Log meter incident"
      >
        <form className="space-y-4 p-5 sm:p-6" onSubmit={submitForm}>
          <div className="block text-sm font-bold text-slate-700">
            <span>Resident</span>
            <ResidentPicker
              consumers={consumers}
              onChange={(id) => setForm((current) => ({ ...current, consumerId: id }))}
              value={form.consumerId}
            />
          </div>

          {selectedConsumer && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
              <p className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold text-navy-900">Latest recorded reading</span>
                <span className="font-mono font-bold text-navy-900">
                  {lastRecordedReading == null
                    ? "none"
                    : `${Number(lastRecordedReading).toLocaleString()} m³`}
                </span>
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-600">
                The closing reading is measured against this value. The actual usage is settled at the next reading.
              </p>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-bold text-slate-700">
              Incident type
              <select className="ww-field mt-2 p-3" onChange={updateForm("incidentType")} value={form.incidentType}>
                <option value="replacement">Meter replacement</option>
                <option value="reset">Meter reset</option>
                <option value="defective">Defective meter</option>
              </select>
            </label>
            <label className="block text-sm font-bold text-slate-700">
              Effective date
              <input className="ww-field mt-2 p-3" max={new Date().toISOString().slice(0, 10)} onChange={updateForm("effectiveDate")} type="date" value={form.effectiveDate} />
            </label>
            <label className="block text-sm font-bold text-slate-700">
              Old meter serial
              <input className="ww-field mt-2 p-3" onChange={updateForm("oldMeterSerial")} placeholder="Optional" type="text" value={form.oldMeterSerial} />
            </label>
            <label className="block text-sm font-bold text-slate-700">
              Old meter closing reading
              <input
                className="ww-field mt-2 p-3 font-mono tabular-nums"
                inputMode="decimal"
                onChange={updateForm("oldFinalReading")}
                placeholder="e.g. 470"
                type="text"
                value={form.oldFinalReading}
              />
              <span className="mt-1.5 block text-xs font-medium leading-5 text-slate-500">
                {lastRecordedReading == null
                  ? "Leave blank when the old meter was not read. The carried usage is then taken from the resident's average."
                  : `When present, prior usage = closing reading − ${Number(lastRecordedReading).toLocaleString()} m³ (latest recorded).`}
              </span>
              {closingDerived != null && (
                <span className={`mt-1.5 block text-xs font-semibold ${closingDerived < 0 ? "text-red-600" : "text-water-800"}`}>
                  {closingDerived < 0
                    ? "The closing reading is below the last recorded reading."
                    : `Carried usage: ${closingDerived.toLocaleString()} m³`}
                </span>
              )}
            </label>
            <label className="block text-sm font-bold text-slate-700">
              New meter serial
              <input className="ww-field mt-2 p-3" onChange={updateForm("newMeterSerial")} placeholder="Optional" type="text" value={form.newMeterSerial} />
            </label>
            <label className="block text-sm font-bold text-slate-700">
              New meter baseline
              <input className="ww-field mt-2 p-3 font-mono tabular-nums" inputMode="decimal" onChange={updateForm("newBaseline")} placeholder="0" type="text" value={form.newBaseline} />
              <span className="mt-1.5 block text-xs font-medium leading-5 text-slate-500">
                The first value printed on the new meter. Use 0 when it starts at zero.
              </span>
            </label>
          </div>

          <label className="block text-sm font-bold text-slate-700">
            Notes
            <textarea className="ww-field mt-2 min-h-20 p-3" onChange={updateForm("notes")} placeholder="Reason, witness, or field observations" value={form.notes} />
          </label>

          <div className="rounded-xl border border-water-200 bg-water-50 p-3 text-xs leading-5 text-slate-600">
            {carried == null ? (
              <>No closing reading was entered, so the carried usage is taken from the resident&apos;s average of recent actual readings. The carried volume is shown in the list after saving, and the next reading applies it.</>
            ) : (
              <>
                Admin-logged incidents are pre-approved, so payments are not held. The next reading will carry
                <span className="mx-1 font-mono font-bold text-navy-900">{number(carried).toLocaleString()} m³</span>
                plus the new meter&apos;s usage above the baseline. If the new meter shows no usage at all, that reading
                is estimated from the resident&apos;s average and returns to you for review.
              </>
            )}
          </div>

          <div className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-4 sm:flex-row sm:justify-end">
            <button
              className="min-h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-navy-900 hover:bg-slate-50"
              onClick={() => setIsFormOpen(false)}
              type="button"
            >
              Cancel
            </button>
            <button className="ww-primary-button min-h-11 px-5 text-sm" disabled={saving} type="submit">
              {saving ? "Saving…" : "Authorize replacement"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        description="Rejecting keeps the bill on hold and asks the field team to correct the reading."
        eyebrow="Review"
        isOpen={Boolean(rejectTarget)}
        onClose={() => setRejectTarget(null)}
        size="sm"
        title="Reject meter incident"
      >
        <div className="space-y-4 p-5 sm:p-6">
          <label className="block text-sm font-bold text-slate-700">
            Reason
            <textarea
              className="ww-field mt-2 min-h-24 p-3"
              onChange={(event) => setRejectReason(event.target.value)}
              placeholder="Why is this incident being rejected?"
              value={rejectReason}
            />
          </label>
          <div className="flex justify-end gap-2">
            <button className="min-h-11 rounded-xl px-4 text-sm font-bold text-slate-600 hover:bg-slate-100" onClick={() => setRejectTarget(null)} type="button">
              Cancel
            </button>
            <button
              className="min-h-11 rounded-xl bg-red-600 px-4 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-60"
              disabled={reviewingId === rejectTarget?.id}
              onClick={handleReject}
              type="button"
            >
              Reject incident
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        description="Every meter incident recorded for this resident."
        eyebrow="Audit trail"
        isOpen={Boolean(historyTarget)}
        onClose={() => setHistoryTarget(null)}
        size="md"
        title="Meter history"
      >
        <div className="p-5 sm:p-6">
          {historyLoading ? (
            <LoadingSkeleton label="Loading meter history" variant="list" />
          ) : history.length === 0 ? (
            <p className="text-sm text-slate-600">No meter incidents have been recorded for this resident.</p>
          ) : (
            <ul className="space-y-3">
              {history.map((incident) => (
                <li className="rounded-xl border border-slate-200 bg-slate-50 p-3" key={incident.id}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-bold capitalize text-navy-900">{incident.incidentType}</span>
                    <div className="flex flex-wrap gap-1.5">
                      {badge(statusLabel[incident.status] ?? incident.status, statusTone[incident.status] ?? statusTone.expired)}
                      {badge(reviewLabel[incident.reviewStatus] ?? incident.reviewStatus, reviewTone[incident.reviewStatus] ?? reviewTone.pending)}
                    </div>
                  </div>
                  <dl className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                    <div><dt className="font-semibold text-slate-500">Effective</dt><dd className="font-bold text-navy-900">{formatDate(incident.effectiveDate)}</dd></div>
                    <div><dt className="font-semibold text-slate-500">Carried over</dt><dd className="font-mono font-bold text-navy-900">{number(incident.priorUsage).toLocaleString()} m³</dd></div>
                    <div><dt className="font-semibold text-slate-500">Basis</dt><dd className="font-bold text-navy-900">{basisLabel[incident.priorUsageBasis] ?? incident.priorUsageBasis}</dd></div>
                    <div><dt className="font-semibold text-slate-500">Baseline</dt><dd className="font-mono font-bold text-navy-900">{number(incident.newBaseline).toLocaleString()} m³</dd></div>
                  </dl>
                  {incident.notes && <p className="mt-2 text-xs leading-5 text-slate-600">{incident.notes}</p>}
                  {incident.rejectedReason && <p className="mt-2 text-xs font-semibold text-red-700">Rejected: {incident.rejectedReason}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Modal>
    </main>
  );
}
